// C# stage of the ring, compiled with NativeAOT into libcscore.
//
// The exports are plain C symbols thanks to [UnmanagedCallersOnly]. The calls
// *out* of C# go through dlsym(RTLD_DEFAULT, ...): the other ring libraries
// are already loaded into the process, so looking symbols up by name avoids
// hard-coding any library path into a [DllImport].

using System;
using System.Runtime.InteropServices;

internal static unsafe class RingStage
{
    [DllImport("libSystem.dylib", EntryPoint = "dlsym")]
    private static extern IntPtr dlsymMac(IntPtr handle, string symbol);

    // glibc keeps dlsym reachable through libdl.so.2 on every version.
    [DllImport("libdl.so.2", EntryPoint = "dlsym")]
    private static extern IntPtr dlsymLinux(IntPtr handle, string symbol);

    private static IntPtr dlsym(IntPtr handle, string symbol) =>
        OperatingSystem.IsMacOS() ? dlsymMac(handle, symbol) : dlsymLinux(handle, symbol);

    /// <summary>
    /// Search every image loaded into the process. The pseudo-handle differs:
    /// RTLD_DEFAULT is -2 on macOS but NULL on glibc, where -2 is an invalid
    /// handle and makes dlsym fault.
    /// </summary>
    private static readonly IntPtr RtldDefault = OperatingSystem.IsMacOS() ? new IntPtr(-2) : IntPtr.Zero;

    // Ring edge: cs -> py.
    private static delegate* unmanaged[Cdecl]<double, int, double> _pyStep;

    // Chord edge: cs -> rust.
    private static delegate* unmanaged[Cdecl]<double> _rustWeight;

    private static void Bind()
    {
        if (_pyStep == null)
        {
            _pyStep = (delegate* unmanaged[Cdecl]<double, int, double>)
                dlsym(RtldDefault, "py_step");
        }
        if (_rustWeight == null)
        {
            _rustWeight = (delegate* unmanaged[Cdecl]<double>)
                dlsym(RtldDefault, "rust_weight");
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "cs_step")]
    public static double Step(double value, int hops)
    {
        Bind();
        double next = (value + 2.0) * _rustWeight();

        Console.Write($"  [cs  ] hops={hops,-2} {value,10:F4} -> {next,10:F4}"
                      + "   ((v + 2) * rust_weight)\n");
        Console.Out.Flush();

        if (hops <= 0)
        {
            return next;
        }
        return _pyStep(next, hops - 1);
    }

    [UnmanagedCallersOnly(EntryPoint = "cs_weight")]
    public static double Weight() => 1.04;
}
