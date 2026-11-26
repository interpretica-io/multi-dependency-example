// Enters the ring at the Go stage, like the other demos enter at theirs.
// The ring libraries are linked through CGO_LDFLAGS (see build.sh).
package main

/*
double go_step(double value, int hops);
*/
import "C"

import (
	"fmt"
	"os"
	"strconv"
)

func main() {
	value := 1.0
	hops := 6
	if len(os.Args) > 1 {
		if v, err := strconv.ParseFloat(os.Args[1], 64); err == nil {
			value = v
		}
	}
	if len(os.Args) > 2 {
		if h, err := strconv.Atoi(os.Args[2]); err == nil {
			hops = h
		}
	}

	fmt.Printf("go-demo: entering the ring at the Go stage\n")
	fmt.Printf("         value=%.4f hops=%d\n\n", value, hops)

	result := float64(C.go_step(C.double(value), C.int(hops)))

	fmt.Printf("\ngo-demo: result = %.4f\n", result)
}
