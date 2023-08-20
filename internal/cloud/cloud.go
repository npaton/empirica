package cloud

import (
	"net/url"
	"os"
	"path"

	"github.com/empiricaly/empirica/internal/settings"
	"github.com/pkg/errors"
)

const (
	apiEnvBaseURL          = "EMPIRICA_CLOUD_DEV_API_BASE_URL"
	apiProductionBaseURL   = "https://us-central1-empirica-cloud.cloudfunctions.net"
	webEnvBaseURL          = "EMPIRICA_CLOUD_DEV_WEB_BASE_URL"
	webProductionBaseURL   = "https://empirica.cloud"
	dashBasePath           = "dash"
	accountLinkingBasePath = "link"
)

// ConfigDir returns the path to the cloud config directory.
func ConfigDir() string {
	return path.Join(settings.ConfigHomeDir(), "cloud")
}

// AuthConfigFile returns the path to the cloud auth config directory.
func AuthConfigFile() string {
	return path.Join(ConfigDir(), "auth.yaml")
}

// baseURL returns the base URL to the cloud API.
func apiBaseURL() string {
	envBaseURLResolved := os.Getenv(apiEnvBaseURL)

	if envBaseURLResolved != "" {
		return envBaseURLResolved
	}

	return apiProductionBaseURL
}

// APIURL returns the URL to the cloud API.
func APIURL(endpoint string) (string, error) {
	u, err := url.JoinPath(apiBaseURL(), endpoint)

	return u, errors.Wrap(err, "join path")
}

// baseURL returns the base URL to the cloud API.
func webBaseURL() string {
	envBaseURLResolved := os.Getenv(webEnvBaseURL)

	if envBaseURLResolved != "" {
		return envBaseURLResolved
	}

	return webProductionBaseURL
}

// WebURL returns the URL to the cloud website.
func WebURL(endpoint string) (string, error) {
	u, err := url.JoinPath(webBaseURL(), endpoint)

	return u, errors.Wrap(err, "join path")
}

// DashURL returns the URL to the cloud web dashboard.
func DashURL(endpoint string) (string, error) {
	base, err := WebURL(dashBasePath)
	if err != nil {
		return "", errors.Wrap(err, "get web URL")
	}

	u, err := url.JoinPath(base, endpoint)

	return u, errors.Wrap(err, "join path")
}

// CloudDashURL returns the URL to the cloud web dashboard.
func AccountLinkingURL() (string, error) {
	return DashURL(accountLinkingBasePath)
}
