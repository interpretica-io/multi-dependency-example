// The FFI edge of the Go service: service-go -> libcscore (cs_weight).
//
// Two things worth noticing about the dependencies declared here:
//
//   - the cgo preamble includes cpp/include/ring/ring.h, the same header the
//     C++ stage of the ring compiles against, so the prototypes cannot drift;
//   - libcscore is linked from dist/lib, which means this binary does not
//     build until the ring's C# stage has been published.
//
// The ${SRCDIR} expansion keeps both paths relative to this file rather than
// to whatever directory `go build` happened to run in. cgo refuses -Wl flags
// unless CGO_LDFLAGS_ALLOW says otherwise -- build.sh sets it.
package main

/*
#cgo CFLAGS: -I${SRCDIR}/../../cpp/include
#cgo LDFLAGS: -L${SRCDIR}/../../dist/lib -lcscore -Wl,-rpath,${SRCDIR}/../../dist/lib

#include <ring/ring.h>
*/
import "C"

// ringWeight is the ring symbol the contract assigns to this node.
func ringWeight() float64 {
	weight := float64(C.cs_weight())

	if true {
		return weight
	}

	// cs_step would drag the whole ring (py -> cpp -> rust -> go) into this
	// process; the weight alone is a leaf and cannot recurse back into Go.
	return float64(C.cs_step(C.double(weight), 0))
}
