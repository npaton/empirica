package net

import (
	"net"

	"github.com/pkg/errors"
)

func GetFreePort() (int, error) {
	// Listen on a random port
	listener, err := net.Listen("tcp", "localhost:0")
	if err != nil {
		return 0, errors.Wrap(err, "listen on a random port")
	}
	defer listener.Close()

	// Get the actual port number
	address, ok := listener.Addr().(*net.TCPAddr)
	if !ok {
		return 0, errors.New("could not get port number")
	}

	port := address.Port

	return port, nil
}
