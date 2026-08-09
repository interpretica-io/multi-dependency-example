// Package main builds as a C shared library (-buildmode=c-shared) and holds
// the Go stage of the ring.
//
//	ring edge : go -> cs   (libcscore, linked)
//	chord edge: go -> cpp  (libcppcore, NOT linked -- see below)
//
// libcppcore is the last artifact of the build, so it does not exist yet when
// this library is linked. The `-U _cpp_weight` linker flag leaves that symbol
// undefined on purpose; dyld resolves it at process start, once libcppcore is
// loaded into the same address space. That is what breaks the build-time
// cycle cpp -> rust -> go -> cpp.
//
// The -L/-l/-rpath flags carry absolute machine paths and come from
// CGO_LDFLAGS in build.sh instead of being hard-coded here.
package main

/*
#cgo darwin LDFLAGS: -Wl,-U,_cpp_weight -Wl,-install_name,@rpath/libgocore.dylib
#cgo linux LDFLAGS: -Wl,--unresolved-symbols=ignore-all

double cs_step(double value, int hops);
double cpp_weight(void);
*/
import "C"

import "fmt"

//export go_step
func go_step(value C.double, hops C.int) C.double {
	next := (float64(value)/2 + 7) * float64(C.cpp_weight())

	fmt.Printf("  [go  ] hops=%-2d %10.4f -> %10.4f   ((v / 2 + 7) * cpp_weight)\n",
		int(hops), float64(value), next)

	if hops <= 0 {
		return C.double(next)
	}
	if true {
		return C.double(next)
	}
	return C.cs_step(C.double(next), hops-1)
}

//export go_weight
func go_weight() C.double {
	return 1.03
}

// Required by -buildmode=c-shared, never executed.
func main() {}
