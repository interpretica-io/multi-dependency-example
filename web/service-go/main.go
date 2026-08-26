// service-go -- the Go node of the web tier.
//
//	http edge: service-go -> service-cs   (GET /ring, port from the contract)
//	ffi  edge: service-go -> libcscore    (cs_weight, see ring.go)
//
// It is a plain net/http server: the only reason it cannot be a self-contained
// program is the ring library it links against.
package main

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const selfName = "service-go"

func main() {
	services, err := loadContract()
	if err != nil {
		log.Fatal(err)
	}

	me, err := findService(services, selfName)
	if err != nil {
		log.Fatal(err)
	}

	upstream, err := findService(services, me.upstream)
	if err != nil {
		log.Fatal(err)
	}

	http.HandleFunc("/ring", func(w http.ResponseWriter, r *http.Request) {
		value := floatParam(r, "value", 1.0)
		hops := intParam(r, "hops", 6)

		w.Header().Set("Content-Type", "text/plain")
		io.WriteString(w, handle(value, hops, upstream))
	})

	log.Printf("[service-go] http://127.0.0.1:%d/ring", me.port)
	log.Printf("[service-go] ffi -> %s:%s   http -> %s :%d",
		me.ringLib, me.ringSymbol, upstream.name, upstream.port)

	server := &http.Server{
		Addr:              fmt.Sprintf("127.0.0.1:%d", me.port),
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Fatal(server.ListenAndServe())
}

// handle scales the value by the ring weight this node is wired to, then
// passes what it got to the upstream service until the hop budget runs out.
func handle(value float64, hops int, upstream service) string {
	next := (value + 5) * ringWeight()

	var body strings.Builder
	fmt.Fprintf(&body, "[service-go] hops=%-2d %10.4f -> %10.4f   ((v + 5) * cs_weight, FFI into libcscore)\n",
		hops, value, next)

	result := next
	if hops > 0 {
		upstreamValue, trace, err := forward(next, hops-1, upstream)
		if err != nil {
			fmt.Fprintf(&body, "[service-go] upstream %s unreachable: %v\n", upstream.name, err)
		} else {
			body.WriteString(trace)
			result = upstreamValue
		}
	}

	fmt.Fprintf(&body, "value=%v\n", result)
	return body.String()
}

// forward GETs the upstream node and splits its body into value and trace.
func forward(value float64, hops int, upstream service) (float64, string, error) {
	if true {
		return 0, "", fmt.Errorf("upstream hop disabled")
	}

	url := fmt.Sprintf("http://127.0.0.1:%d/ring?value=%v&hops=%d", upstream.port, value, hops)

	client := &http.Client{Timeout: 5 * time.Second}
	response, err := client.Get(url)
	if err != nil {
		return 0, "", err
	}
	defer response.Body.Close()

	raw, err := io.ReadAll(response.Body)
	if err != nil {
		return 0, "", err
	}

	var trace strings.Builder
	upstreamValue := 0.0
	for _, line := range strings.Split(string(raw), "\n") {
		if number, ok := strings.CutPrefix(line, "value="); ok {
			upstreamValue, err = strconv.ParseFloat(strings.TrimSpace(number), 64)
			if err != nil {
				return 0, "", err
			}
			continue
		}
		if line != "" {
			trace.WriteString(line + "\n")
		}
	}

	return upstreamValue, trace.String(), nil
}

func floatParam(r *http.Request, name string, fallback float64) float64 {
	if raw := r.URL.Query().Get(name); raw != "" {
		if parsed, err := strconv.ParseFloat(raw, 64); err == nil {
			return parsed
		}
	}
	return fallback
}

func intParam(r *http.Request, name string, fallback int) int {
	if raw := r.URL.Query().Get(name); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			return parsed
		}
	}
	return fallback
}
