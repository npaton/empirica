package cloud

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"time"

	"github.com/pkg/errors"
	"github.com/rs/zerolog/log"
	"gopkg.in/yaml.v3"
)

var ErrNoCurrentSession = errors.New("no current session")

func GetCurrent() (*AuthSession, error) {
	config, err := ReadAuthConfig()
	if err != nil {
		return nil, errors.Wrap(err, "get auth config")
	}

	for _, session := range config.Sessions {
		if session.UserID == config.Current {
			return &session, nil
		}
	}

	return nil, ErrNoCurrentSession
}

const signInMessage = `Visit this URL on this device to log in:`

const (
	// Maximum duration for reading the entire request, including the body.
	readTimeout = 5 * time.Second

	// Maximum duration before timing out writes of the response.
	writeTimeout = 10 * time.Second

	// Maximum amount of time to wait for the next request when keep-alives are enabled.
	idleTimeout = 15 * time.Second

	// Time to wait for request headers is set to 1 second.
	readHeaderTimeout = 1 * time.Second

	// Time to wait for graceful shutdown.
	shutdownGraceDuration = 5 * time.Second

	// Env var for the signin port to listen on.
	devSignInPortEnvVar = "EMPIRICA_CLOUD_DEV_SIGNING_PORT"
)

// SignIn starts the sign in http server on a random port and return the port.
func startSignInServer(ctx context.Context, handle http.Handler) (int, error) {
	var port int

	envportstr := os.Getenv(devSignInPortEnvVar)
	if envportstr != "" {
		iport, err := strconv.Atoi(envportstr)
		if err != nil {
			return 0, errors.Wrap(err, "lookup port")
		}

		port = iport
	}

	handler := http.NewServeMux()
	handler.Handle("/", handle)

	server := &http.Server{
		Handler:           handler,
		ReadTimeout:       readTimeout,
		WriteTimeout:      writeTimeout,
		IdleTimeout:       idleTimeout,
		ReadHeaderTimeout: readHeaderTimeout,
	}

	listener, err := net.Listen("tcp", fmt.Sprintf("localhost:%d", port))
	if err != nil {
		return 0, errors.Wrap(err, "listen")
	}

	tcpaddr, ok := listener.Addr().(*net.TCPAddr)
	if !ok {
		return 0, errors.New("listener is not a TCP address")
	}

	port = tcpaddr.Port

	go func() {
		if err := server.Serve(listener); err != nil && errors.Is(err, http.ErrServerClosed) {
			log.Error().Err(err).Msg("server start error")
		}
	}()

	go func() {
		<-ctx.Done()

		// Use a context with a timeout to give active connections a chance to finish.
		shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownGraceDuration)
		defer cancel()

		if err := server.Shutdown(shutdownCtx); err != nil && errors.Is(err, http.ErrServerClosed) {
			log.Error().Err(err).Msg("server shutdown error")
		}
	}()

	return port, nil
}

const signInRequestTimeout = 5 * time.Minute

func SignIn(ctx context.Context, output io.Writer) (*AuthSession, error) {
	codeCh := make(chan string)

	port, err := startSignInServer(ctx, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, signupCallbackPage)

		codeCh <- r.URL.Query().Get("code")
	}))
	if err != nil {
		return nil, errors.Wrap(err, "start sign in server")
	}

	fmt.Fprintln(output, signInMessage)

	linkURL, err := AccountLinkingURL()
	if err != nil {
		return nil, errors.Wrap(err, "get account linking url")
	}

	uri, err := url.Parse(linkURL)
	if err != nil {
		return nil, errors.Wrap(err, "parse account linking url")
	}

	query := uri.Query()
	query.Set("redirect", fmt.Sprintf("http://localhost:%d", port))
	uri.RawQuery = query.Encode()

	fmt.Fprintf(output, "\n     %s\n\n", uri.String())

	select {
	case <-ctx.Done():
		return nil, errors.Wrap(ctx.Err(), "sign in")
	case <-time.After(signInRequestTimeout):
		return nil, errors.New("sign in timeout")
	case code := <-codeCh:
		return requestToken(ctx, code)
	}
}

const (
	// URL to request a token from.
	tokenRequestEndpoint = "/tokenRequest"

	// Parameter name for the code.
	tokenRequestCodeParam = "code"
)

func requestToken(ctx context.Context, code string) (*AuthSession, error) {
	endpointURL, err := APIURL(tokenRequestEndpoint)
	if err != nil {
		return nil, errors.Wrap(err, "get token request endpoint")
	}

	uri, err := url.Parse(endpointURL)
	if err != nil {
		return nil, errors.Wrap(err, "parse account linking url")
	}

	q := uri.Query()
	q.Set(tokenRequestCodeParam, code)
	uri.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, uri.String(), nil)
	if err != nil {
		return nil, errors.Wrap(err, "create request")
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, errors.Wrap(err, "request token")
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, errors.Errorf("request token: %s", resp.Status)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, errors.Wrap(err, "read response body")
	}

	authSession := new(AuthSession)

	err = json.Unmarshal(body, authSession)
	if err != nil {
		return nil, errors.Wrap(err, "unmarshal response body")
	}

	config, err := ReadAuthConfig()
	if err != nil {
		return nil, errors.Wrap(err, "get auth config")
	}

	authSession.CreatedAt = time.Now()
	config.Current = authSession.UserID
	config.Sessions = append(config.Sessions, *authSession)

	if err := WriteAuthConfig(config); err != nil {
		return nil, errors.Wrap(err, "write auth config")
	}

	log.Info().Msg("Successful sign in")

	return authSession, nil
}

type AuthConfig struct {
	Current  string        `yaml:"current"`
	Sessions []AuthSession `yaml:"sessions"`
}

type AuthSession struct {
	UserID    string    `yaml:"userId"`
	Token     string    `yaml:"token"`
	CreatedAt time.Time `yaml:"createdAt"`
}

// ReadAuthConfig parses the auth config file.
func ReadAuthConfig() (*AuthConfig, error) {
	content, err := os.ReadFile(AuthConfigFile())
	if err != nil {
		if os.IsNotExist(err) {
			return &AuthConfig{}, nil
		}

		return nil, errors.Wrap(err, "read config file")
	}

	conf := &AuthConfig{}

	err = yaml.Unmarshal(content, &conf)
	if err != nil {
		return nil, errors.Wrap(err, "unmarshal config")
	}

	return conf, nil
}

const (
	authConfigFilePerm = 0o600
	authConfigDirPerm  = 0o700
)

// WriteAuthConfig writes the auth config file.
func WriteAuthConfig(conf *AuthConfig) error {
	content, err := yaml.Marshal(conf)
	if err != nil {
		return errors.Wrap(err, "marshal config")
	}

	// Create the config directory if it doesn't exist.
	err = os.MkdirAll(ConfigDir(), authConfigDirPerm)
	if err != nil {
		return errors.Wrap(err, "create config directory")
	}

	err = os.WriteFile(AuthConfigFile(), content, authConfigFilePerm)
	if err != nil {
		return errors.Wrap(err, "write config file")
	}

	return nil
}

const signupCallbackPage = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account connection</title>

  <style>
    body {
      margin: 0;
      font-family: sans-serif;
    }

    .center {
      height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
  </style>
</head>
<body>
  <div class="center">
    <h2>You can safely close this window</h2>
    <p>The empirica command line is finishing signup.</p>
  </div>
</body>
</html>`
