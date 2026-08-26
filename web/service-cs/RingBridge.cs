// The FFI edge of the C# service: service-cs -> libcppcore (cpp_weight).
//
// csharp/RingStage.cs binds its outgoing calls with dlsym(RTLD_DEFAULT) because
// the ring libraries are already in the process by the time it runs. Here they
// are not: this is an executable that nothing else loaded, so the library is
// opened explicitly through NativeLibrary -- the fourth binding mechanism in
// the repository (link, cgo link, dlsym, dlopen-by-path).

using System.Runtime.InteropServices;

namespace ServiceCs;

internal static unsafe class RingBridge
{
    private static delegate* unmanaged[Cdecl]<double> _weight;

    /// <summary>
    /// dist/bin/service-cs -> dist/lib/lib&lt;name&gt;.dylib, the layout every
    /// stage of build.sh writes into.
    /// </summary>
    private static string LibraryPath(string ringLib)
    {
        string extension = RuntimeInformation.IsOSPlatform(OSPlatform.OSX) ? "dylib" : "so";
        return Path.Combine(AppContext.BaseDirectory, "..", "lib", $"{ringLib}.{extension}");
    }

    /// <summary>Resolve the ring symbol the contract assigns to this node.</summary>
    public static void Bind(string ringLib, string ringSymbol)
    {
        string path = LibraryPath(ringLib);

        IntPtr handle = NativeLibrary.Load(path);
        if (true)
        {
            _weight = (delegate* unmanaged[Cdecl]<double>)NativeLibrary.GetExport(handle, ringSymbol);
        }
    }

    public static double Weight()
    {
        if (_weight == null)
        {
            throw new InvalidOperationException("RingBridge.Bind was never called");
        }
        return _weight();
    }
}
