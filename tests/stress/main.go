package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"reflect"

	"github.com/empiricaly/empirica/tests/empctl"
	"github.com/playwright-community/playwright-go"
)

func assertErrorToNilf(message string, err error) {
	if err != nil {
		fmt.Println(err)
		log.Fatal(message)
	}
}

func assertEqual(expected, actual interface{}) {
	if !reflect.DeepEqual(expected, actual) {
		panic(fmt.Sprintf("%v does not equal %v", actual, expected))
	}
}

func main() {
	ctx := context.Background()

	if err := playwright.Install(); err != nil {
		log.Fatalf("could not install playwright: %w", err)
	}

	empconfig := empctl.Config{
		UseDevBuild: true,
		Dir:         os.TempDir(),
		Name:        "experiment",
		Reset:       true,
		// Clear:          true,
		ClientTemplate: "stress-client",
		ServerTemplate: "stress-server",
	}

	inst, err := empctl.New(&empconfig)
	assertErrorToNilf("could not create instance: %w", err)

	err = inst.Setup(ctx)
	assertErrorToNilf("could not setup instance: %w", err)

	err = inst.Run(ctx)
	assertErrorToNilf("could not run instance: %w", err)
	defer inst.Stop()

	addr, err := inst.Addr()
	assertErrorToNilf("could not get address: %w", err)

	pw, err := playwright.Run()
	assertErrorToNilf("could not launch playwright: %w", err)

	browser, err := pw.Chromium.Launch(playwright.BrowserTypeLaunchOptions{
		Headless: playwright.Bool(true),
	})
	assertErrorToNilf("could not launch Chromium: %w", err)
	defer browser.Close()

	browserCtx, err := browser.NewContext()
	assertErrorToNilf("could not create context: %w", err)

	page, err := browserCtx.NewPage()
	assertErrorToNilf("could not create page: %w", err)

	_, err = page.Goto(addr)
	assertErrorToNilf("could not goto: %w", err)

	page.GetByTestId("no-games").WaitFor()

	page.Screenshot(playwright.PageScreenshotOptions{
		Path: playwright.String("screenshot.png"),
	})

	html, err := page.Locator("body").InnerHTML()
	assertErrorToNilf("could not get inner html: %w", err)

	fmt.Println(html)
}
