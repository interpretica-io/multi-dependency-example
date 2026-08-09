// Package main builds as a C shared library (-buildmode=c-shared) and forms
// the third link of the ring: Go -> C++ -> Rust -> Go.
//
// cpp_step lives in libcppcore, which is *not* available when this library is
// linked -- it is the very first artifact of the build. The `-U _cpp_step`
// linker flag leaves that symbol undefined on purpose; dyld resolves it at
// process start, once libcppcore is loaded into the same address space.
package main

/*
#cgo darwin LDFLAGS: -Wl,-U,_cpp_step -Wl,-install_name,@rpath/libgocore.dylib
#cgo linux LDFLAGS: -Wl,--unresolved-symbols=ignore-all

double cpp_step(double value, int hops);
*/
import "C"

import "fmt"

//export go_step
func go_step(value C.double, hops C.int) C.double {
	next := float64(value)/2 + 7

	fmt.Printf("  [go  ] hops=%-2d %10.4f -> %10.4f   (v / 2 + 7)\n",
		int(hops), float64(value), next)

	if hops <= 0 {
		return C.double(next)
	}
	return C.cpp_step(C.double(next), hops-1)
}

// Required by -buildmode=c-shared, never executed.
func main() {}
