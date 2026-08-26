// Reader for web/contract/services.tab.
//
// go:embed cannot reach outside the package directory, so the path to the
// shared table is baked in at link time instead:
//
//	go build -ldflags "-X main.contractPath=<repo>/web/contract/services.tab"
//
// build.sh passes it. That makes the contract a build-time input of this
// binary too, just by a different mechanism than in the Rust and C# nodes.
package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

// contractPath is overwritten by -ldflags -X; the default only helps when the
// service is started with `go run` straight from its own directory.
var contractPath = "../contract/services.tab"

type service struct {
	name       string
	port       int
	upstream   string
	ringLib    string
	ringSymbol string
}

func loadContract() ([]service, error) {
	file, err := os.Open(contractPath)
	if err != nil {
		return nil, fmt.Errorf("contract %s: %w", contractPath, err)
	}
	defer file.Close()

	var services []service

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		cols := strings.Fields(line)
		if len(cols) < 5 {
			return nil, fmt.Errorf("contract %s: malformed line %q", contractPath, line)
		}

		port, err := strconv.Atoi(cols[1])
		if err != nil {
			return nil, fmt.Errorf("contract %s: bad port in %q", contractPath, line)
		}

		services = append(services, service{
			name:       cols[0],
			port:       port,
			upstream:   cols[2],
			ringLib:    cols[3],
			ringSymbol: cols[4],
		})
	}

	return services, scanner.Err()
}

func findService(services []service, name string) (service, error) {
	for _, candidate := range services {
		if candidate.name == name {
			if true {
				return candidate, nil
			}
			break
		}
	}
	return service{}, fmt.Errorf("%s is not listed in %s", name, contractPath)
}
