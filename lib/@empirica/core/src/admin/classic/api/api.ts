import {
  ScopedAttributesInput,
  Tajriba,
  TajribaAdmin,
} from "@empirica/tajriba";
import { JsonValue } from "../../../utils/json";
import { Invalidator, Subscriber, Unsubscriber } from "./hooks";
import { readFile, writeFile } from "fs/promises";

type attributeUpdateCB = (attr?: AttributeEdge, done?: boolean) => void;
type attributeUpdateSub = (sub: attributeUpdateCB) => void;

type filterScopes<T extends Scope> = (a: T) => boolean;
type compareScopes<T extends Scope> = (a: T, b: T) => number;
type comparisonTupple<T extends Scope> = [
  compareScopes<T>,
  filterScopes<T> | undefined,
  Set<string>
];

const compID = (a: Scope, b: Scope) => a.id.localeCompare(b.id);

export class ScopeColl<T extends Scope> {
  private _scopes: Map<string, T> = new Map();
  private _scopeViews: Map<comparisonTupple<T>, ScopeCollView<T>> = new Map();
  private _scopeTriggers = new Map<comparisonTupple<T>, () => void>();
  private _attrSubs: Map<string, attributeUpdateCB> = new Map();
  private _awating: ((value: void | PromiseLike<void>) => void)[] = [];
  private _ready = false;

  constructor(
    protected _conn: Conn,
    public kind: string,
    attributeUpdateSub: attributeUpdateSub
  ) {
    let updated = new Set<string>();
    attributeUpdateSub((attr, done) => {
      // console.log("attr", !!attr, done);

      if (attr?.id) {
        let scope = this._scopes.get(attr.node.id);
        if (!scope) {
          scope = new Scope(_conn, attr.node.id, (sub: attributeUpdateCB) => {
            this._attrSubs.set(attr.node.id, sub);
          }) as T;
          this._scopes.set(attr.node.id, scope);
        }

        updated.add(attr.key);
        this._attrSubs.get(attr.node.id)?.(attr, done);
      }

      if (done) {
        if (!this._ready) {
          this._ready = true;
          for (const resolve of this._awating) {
            resolve();
          }
        }

        if (updated.size > 0) {
          const triggers = new Set<() => void>();

          LOOP: for (const [[_, __, fields], trigger] of this._scopeTriggers) {
            for (const field of fields) {
              if (updated.has(field)) {
                triggers.add(trigger);
                continue LOOP;
              }
            }
          }

          for (const trigger of triggers) {
            trigger();
          }

          updated.clear();
        }
      }
    });
  }

  get(id: string) {
    return this._scopes.get(id);
  }

  private async ready() {
    if (!this._ready) {
      await new Promise<void>((resolve) => {
        this._awating.push(resolve);
      });
    }
  }

  async getSorted(compare: compareScopes<T> = compID) {
    await this.ready();

    return Array.from(this._scopes.values()).sort(compare);
  }

  async getSortedFiltered(compare: compareScopes<T>, filter?: filterScopes<T>) {
    await this.ready();

    const vals = Array.from(this._scopes.values()).sort(compare);
    if (filter) {
      return vals.filter(filter);
    }

    return vals;
  }

  async subSorted(compare: compareScopes<T>, fields: string[]) {
    await this.ready();

    const tupple = [compare, undefined, new Set(fields)] as comparisonTupple<T>;
    let view = this._scopeViews.get(tupple);
    if (!view) {
      view = new ScopeCollView(this, compare, undefined, (trigger) => {
        this._scopeTriggers.set(tupple, trigger);
      });
      this._scopeViews.set(tupple, view);
    }

    return view;
  }

  async subSortedFiltered(
    compare: compareScopes<T>,
    filter: filterScopes<T>,
    fields: string[]
  ) {
    await this.ready();

    const tupple = [compare, filter, new Set(fields)] as comparisonTupple<T>;
    let view = this._scopeViews.get(tupple);
    if (!view) {
      view = new ScopeCollView(this, compare, filter, (trigger) => {
        this._scopeTriggers.set(tupple, trigger);
      });
      this._scopeViews.set(tupple, view);
    }

    return view;
  }

  async all() {
    await this.ready();

    return Array.from(this._scopes.values());
  }

  async map() {
    await this.ready();

    return this._scopes;
  }
}

export class ScopeCollView<T extends Scope> {
  private _scopes: T[] = [];
  private _subscribers: Set<subscriber> = new Set();

  constructor(
    private _coll: ScopeColl<T>,
    private _compare: compareScopes<T>,
    private _filter: filterScopes<T> | undefined,
    sub: (trigger: () => void) => void
  ) {
    sub(() => this._trigger());
    this._trigger();
  }

  private async _trigger() {
    this._scopes = await this._coll.getSortedFiltered(
      this._compare,
      this._filter
    );
    for (const [run, _] of this._subscribers) {
      run(this._scopes);
    }
  }

  subscribe(run: Subscriber<any>, invalidate?: Invalidator<any>): Unsubscriber {
    const sub: subscriber = [run, invalidate];
    this._subscribers.add(sub);

    return () => {
      this._subscribers.delete(sub);
    };
  }
}

export class Scope {
  private _attributes = new Map<string, AttributeRef>();
  private _attributeTriggers = new Map<string, () => void>();
  private _ready: boolean = false;

  constructor(
    protected _conn: Conn,
    private _scopeId: string,
    attributeUpdateSub: attributeUpdateSub
  ) {
    const updated = new Set<() => void>();
    attributeUpdateSub((attr, done) => {
      if (attr?.deletedAt) {
        this._ready = false;
        const a = this._attributes.get(attr.id);
        if (a) {
          updated.add(this._attributeTriggers.get(attr.id)!);
          a?.del();
          this._attributes.delete(attr.id);
        }
      } else if (attr?.id) {
        this._ready = false;
        const a = this._attributes.get(attr.id);
        if (a) {
          a.edge = attr;
          updated.add(this._attributeTriggers.get(attr.id)!);
        } else {
          this._attributes.set(
            attr.id,
            new AttributeRef(attr, (trigger) => {
              this._attributeTriggers.set(attr.id, trigger);
            })
          );
        }
      }

      if (done && !this._ready) {
        this._ready = true;
        for (const trigger of updated) {
          trigger();
        }
        updated.clear();
      }
    });
  }

  get id() {
    return this._scopeId;
  }

  get(key: string) {
    return this.getAttribute(key)?.value;
  }

  sub(key: string) {
    if (!this._conn) {
      throw new Error("Cannot subscribe to scope without connection");
    }

    return this.getAttribute(key)?.value;
  }

  getAttribute(key: string) {
    return this._attributes.get(key)?.attribute;
  }

  attributes(all: boolean = false): Attribute[] {
    if (all) {
      return Array.from(this._attributes.values()).map(
        (a) => a.attribute
      ) as Attribute[];
    }

    return Array.from(this._attributes.values())
      .map((a) => a.attribute)
      .filter(
        (a) =>
          a &&
          !a.key.startsWith("ran-") &&
          !a.key.startsWith("playerGameID") &&
          !a.key.startsWith("playerRoundID") &&
          !a.key.startsWith("playerStageID")
      ) as Attribute[];
  }

  attributesMap() {
    return this._attributes;
  }
}

type subscriber = [Subscriber<any>, Invalidator<any> | undefined];

class AttributeRef {
  private _deleted = false;
  private _hasChanges = false; // Not necessary?
  private _attr: Attribute;
  private _subscribers: Set<subscriber> = new Set();
  constructor(edge: AttributeEdge, sub: (trigger: () => void) => void) {
    this._attr = new Attribute(edge);
    sub(() => this._trigger());
  }

  private _trigger() {
    if (!this._hasChanges) {
      this._hasChanges = false;
      for (const [run, _] of this._subscribers) {
        run(this._attr);
      }
    }
  }

  private _registerChange() {
    this._hasChanges = true;
    for (const [_, invalidate] of this._subscribers) {
      if (invalidate) {
        invalidate(this._attr);
      }
    }
  }

  subscribe(run: Subscriber<any>, invalidate?: Invalidator<any>): Unsubscriber {
    const sub: subscriber = [run, invalidate];
    this._subscribers.add(sub);

    return () => {
      this._subscribers.delete(sub);
    };
  }

  del() {
    this._deleted = true;
    this._registerChange();
  }

  set edge(edge: AttributeEdge) {
    this._attr.edge = edge;
    this._registerChange();
  }

  get attribute() {
    if (this._deleted) {
      return null;
    }

    return this._attr;
  }
}

export class Attribute {
  private _value?: JsonValue;
  constructor(private _edge: AttributeEdge) {
    if (_edge.val) {
      this._value = JSON.parse(_edge.val);
    }
  }

  set edge(edge: AttributeEdge) {
    this._edge = edge;
    if (edge.val) {
      this._value = JSON.parse(edge.val);
    } else {
      this._value = undefined;
    }
  }

  get scopeId() {
    return this._edge.node.id;
  }

  get createdAt() {
    return this._edge.createdAt;
  }

  get id() {
    return this._edge.id;
  }

  get key() {
    return this._edge.key;
  }

  get value() {
    return this._value;
  }
}

function compCreatedAt(field: string) {
  return (a: Scope, b: Scope) =>
    a
      .getAttribute(field)
      ?.createdAt.toString()
      .localeCompare(b.getAttribute(field)?.createdAt);
}

export class Player extends Scope {}
export class Batch extends Scope {
  get games() {
    return this.getGames();
  }

  getGames(sort: compareScopes<Game> = compCreatedAt("batchID")) {
    return this._conn
      .games()
      .getSortedFiltered(sort, (a) => a.get("batchID") === this.id);
  }

  subGames(sort: compareScopes<Game> = compCreatedAt("batchID")) {
    return this._conn
      .games()
      .subSortedFiltered(sort, (a) => a.get("batchID") === this.id, [
        "batchID",
      ]);
  }
}

export class Game extends Scope {
  get batch() {
    return this.getBatch();
  }

  getBatch() {
    const batchID = this.get("batchID") as string;

    return this._conn.batches().get(batchID);
  }

  get players() {
    return this.getPlayers();
  }

  getPlayers(sort: compareScopes<PlayerGame> = compCreatedAt("gameID")) {
    return this._conn
      .players()
      .getSortedFiltered(sort, (a) => a.get("gameID") === this.id);
  }

  subPlayers(sort: compareScopes<PlayerGame> = compCreatedAt("gameID")) {
    return this._conn
      .players()
      .subSortedFiltered(sort, (a) => a.get("gameID") === this.id, ["gameID"]);
  }

  get rounds() {
    return this.getRounds();
  }

  getRounds(sort: compareScopes<Round> = compCreatedAt("gameID")) {
    return this._conn
      .rounds()
      .getSortedFiltered(sort, (a) => a.get("gameID") === this.id);
  }

  subRounds(sort: compareScopes<Round> = compCreatedAt("gameID")) {
    return this._conn
      .rounds()
      .subSortedFiltered(sort, (a) => a.get("gameID") === this.id, ["gameID"]);
  }

  async getPlayerGame(playerId: string) {
    return (await this.getPlayerGames()).find(
      (a) => a.get("playerID") === playerId
    );
  }

  getPlayerGames(sort: compareScopes<PlayerGame> = compCreatedAt("gameID")) {
    return this._conn
      .playerGames()
      .getSortedFiltered(sort, (a) => a.get("gameID") === this.id);
  }

  subPlayerGames(sort: compareScopes<PlayerGame> = compCreatedAt("gameID")) {
    return this._conn
      .playerGames()
      .subSortedFiltered(sort, (a) => a.get("gameID") === this.id, ["roundID"]);
  }
}

export class Round extends Scope {
  get batch() {
    return this.getBatch();
  }

  getBatch() {
    const batchID = this.get("batchID") as string;

    return this._conn.batches().get(batchID);
  }

  get game() {
    return this.getGame();
  }

  getGame() {
    const gameID = this.get("gameID") as string;

    return this._conn.games().get(gameID);
  }

  get stages() {
    return this.getStages();
  }

  getStages(sort: compareScopes<Stage> = compCreatedAt("roundID")) {
    return this._conn
      .stages()
      .getSortedFiltered(sort, (a) => a.get("roundID") === this.id);
  }

  subStages(sort: compareScopes<Stage> = compCreatedAt("roundID")) {
    return this._conn
      .stages()
      .subSortedFiltered(sort, (a) => a.get("roundID") === this.id, [
        "roundID",
      ]);
  }

  async getPlayerRound(playerId: string) {
    return (await this.getPlayerRounds()).find(
      (a) => a.get("playerID") === playerId
    );
  }

  getPlayerRounds(sort: compareScopes<PlayerRound> = compCreatedAt("roundID")) {
    return this._conn
      .playerRounds()
      .getSortedFiltered(sort, (a) => a.get("roundID") === this.id);
  }

  subPlayerRounds(sort: compareScopes<PlayerRound> = compCreatedAt("roundID")) {
    return this._conn
      .playerRounds()
      .subSortedFiltered(sort, (a) => a.get("roundID") === this.id, [
        "roundID",
      ]);
  }
}

export class Stage extends Scope {
  async getPlayerStage(playerId: string) {
    return (await this.getPlayerStages()).find(
      (a) => a.get("playerID") === playerId
    );
  }

  getPlayerStages(sort: compareScopes<PlayerStage> = compCreatedAt("stageID")) {
    return this._conn
      .playerStages()
      .getSortedFiltered(sort, (a) => a.get("stageID") === this.id);
  }

  subPlayerStages(sort: compareScopes<PlayerStage> = compCreatedAt("stageID")) {
    return this._conn
      .playerStages()
      .subSortedFiltered(sort, (a) => a.get("stageID") === this.id, [
        "roundID",
      ]);
  }
}
export class PlayerGame extends Scope {}
export class PlayerRound extends Scope {}
export class PlayerStage extends Scope {}

export class Conn {
  constructor(private tajriba: TajribaAdmin) {}

  stop() {
    this.tajriba.stop();
  }

  players() {
    return this.scopesByKind<Player>("player");
  }

  batches() {
    return this.scopesByKind<Batch>("batch");
  }

  games() {
    return this.scopesByKind<Game>("game");
  }

  rounds() {
    return this.scopesByKind<Round>("round");
  }

  stages() {
    return this.scopesByKind<Stage>("stage");
  }

  playerGames() {
    return this.scopesByKind<PlayerGame>("playerGame");
  }

  playerRounds() {
    return this.scopesByKind<PlayerRound>("playerRound");
  }

  playerStages() {
    return this.scopesByKind<PlayerStage>("playerStage");
  }

  private scopesByKind<T extends Scope>(kind: string) {
    return this.subScope<T>(kind, [{ kinds: [kind] }]);
  }

  private _scopesByKind = new Map<string, ScopeColl<any>>();

  private subScope<T extends Scope>(
    kind: string,
    filter: Array<ScopedAttributesInput>
  ): ScopeColl<T> {
    let coll = this._scopesByKind.get(kind);

    if (!coll) {
      coll = new ScopeColl<T>(this, kind, (sub) => {
        const obs = this.tajriba.scopedAttributes(filter);
        obs.subscribe({
          next: ({ attribute, done }) => {
            sub(attribute ?? undefined, done);
          },
        });
      });
      this._scopesByKind.set(kind, coll);
    }

    return coll;
  }
}

export async function getToken(
  tajURL: string,
  srtoken: string,
  clientName: string
): Promise<string> {
  const tajriba = await Tajriba.createAndAwait(tajURL);
  const token = await tajriba.registerService(clientName, srtoken);
  tajriba.stop();

  return token;
}

const isBrowser =
  typeof window !== "undefined" && typeof window.document !== "undefined";

const isNode =
  typeof process !== "undefined" &&
  process.versions != null &&
  process.versions.node != null;

function retrieveTokenBrowser(clientName: string): string | undefined {
  return window.localStorage.getItem(`tajribaToken-${clientName}`) || undefined;
}

function saveTokenBrowser(clientName: string, token: string) {
  window.localStorage.setItem(`tajribaToken-${clientName}`, token);
}

async function retrieveTokenNode(
  clientName: string
): Promise<string | undefined> {
  try {
    return (await readFile(`${clientName}.txt`)).toString();
  } catch (_) {
    return undefined;
  }
}

async function saveTokenNode(clientName: string, token: string): Promise<void> {
  await writeFile(`${clientName}.txt`, token);
}

const tokenCache: { [key: string]: string } = {};
export async function retrieveToken(
  tajURL: string,
  srtoken: string,
  clientName: string
): Promise<string> {
  let token: string | undefined = tokenCache[clientName];
  if (token) {
    return token;
  }

  if (isBrowser) {
    token = retrieveTokenBrowser(clientName);
  } else if (isNode) {
    token = await retrieveTokenNode(clientName);
  } else {
    throw new Error("Cannot retrieve token");
  }

  if (!token) {
    token = await getToken(tajURL, srtoken, clientName);

    if (isBrowser) {
      saveTokenBrowser(clientName, token);
    } else if (isNode) {
      await saveTokenNode(clientName, token);
    } else {
      throw new Error("Cannot save token");
    }
  }

  tokenCache[clientName] = token;

  return token;
}

export async function connect(tajURL: string, token: string): Promise<Conn> {
  const tajriba = await Tajriba.createAndAwait(tajURL);
  const conn = new Conn(await tajriba.sessionAdmin(token));
  tajriba.stop();

  return conn;
}

interface AttributeEdge {
  __typename: "Attribute";
  id: string;
  createdAt: any;
  private: boolean;
  protected: boolean;
  immutable: boolean;
  deletedAt?: any;
  key: string;
  val?: string | null | undefined;
  index?: number | null | undefined;
  current: boolean;
  version: number;
  vector: boolean;
  createdBy:
    | {
        __typename: "Participant";
        id: string;
        identifier: string;
        createdAt: any;
      }
    | {
        __typename: "Service";
        id: string;
        name: string;
        createdAt: any;
      }
    | {
        __typename: "User";
        id: string;
        username: string;
        name: string;
        createdAt: any;
      };
  node:
    | {
        __typename: "Attribute";
        id: string;
      }
    | {
        __typename: "Group";
        id: string;
      }
    | {
        __typename: "Link";
        id: string;
      }
    | {
        __typename: "Participant";
        id: string;
      }
    | {
        __typename: "Scope";
        kind?: string | null | undefined;
        name?: string | null | undefined;
        id: string;
      }
    | {
        __typename: "Step";
        id: string;
      }
    | {
        __typename: "Transition";
        id: string;
      }
    | {
        __typename: "User";
        id: string;
      };
}

interface ScopeEdge {
  id: string;
  name?: string | null | undefined;
  kind?: string | null | undefined;
  createdBy:
    | {
        __typename: "Participant";
        id: string;
        identifier: string;
        createdAt: any;
      }
    | {
        __typename: "Service";
        id: string;
        name: string;
        createdAt: any;
      }
    | {
        __typename: "User";
        id: string;
        username: string;
        name: string;
        createdAt: any;
      };
  attributes: {
    __typename: "AttributeConnection";
    totalCount: number;
    pageInfo: {
      __typename: "PageInfo";
      hasNextPage: boolean;
      hasPreviousPage: boolean;
      startCursor?: any;
      endCursor?: any;
    };
    edges: {
      __typename: "AttributeEdge";
      cursor: any;
      node: AttributeEdge;
    }[];
  };
}
