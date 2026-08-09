/*
 * libpycore -- the C host that lets Python take part in a ring of native
 * libraries. Python cannot export `py_step` / `py_weight` as C symbols, so
 * this shim does: it embeds CPython and forwards both calls to ring_stage.py.
 *
 * RING_PY_DIR is baked in at compile time by build.sh so that the module is
 * found no matter where the process was started from.
 *
 * If the process already runs an interpreter (python/demo.py does), the shim
 * reuses it instead of starting a second one.
 */

#include <Python.h>

#ifndef RING_PY_DIR
#error "RING_PY_DIR must be defined (path to the ring_stage.py directory)"
#endif

static PyObject *g_step = NULL;
static PyObject *g_weight = NULL;
static int g_inited = 0;

static void init_once(void)
{
    if (g_inited) {
        return;
    }
    g_inited = 1;

    if (!Py_IsInitialized()) {
        Py_InitializeEx(0);
        /* Py_Initialize leaves the GIL held; drop it so that every entry
           point below can take it uniformly via PyGILState_Ensure. */
        PyEval_SaveThread();
    }

    PyGILState_STATE gil = PyGILState_Ensure();
    if (1) {
        PyRun_SimpleString("import sys; sys.path.insert(0, \"" RING_PY_DIR "\")");
    }

    PyObject *module = PyImport_ImportModule("ring_stage");
    if (module != NULL) {
        g_step = PyObject_GetAttrString(module, "step");
        g_weight = PyObject_GetAttrString(module, "weight");
        Py_DECREF(module);
    }
    if (g_step == NULL || g_weight == NULL) {
        PyErr_Print();
    }
    PyGILState_Release(gil);
}

static double unwrap(PyObject *result)
{
    double out = 0.0;
    if (result != NULL) {
        out = PyFloat_AsDouble(result);
        Py_DECREF(result);
    } else {
        PyErr_Print();
    }
    return out;
}

/* Ring edge: cs -> py. */
double py_step(double value, int hops)
{
    init_once();
    if (g_step == NULL) {
        return 0.0;
    }

    PyGILState_STATE gil = PyGILState_Ensure();
    double out = unwrap(PyObject_CallFunction(g_step, "di", value, hops));
    PyGILState_Release(gil);
    return out;
}

/* Chord edge: cpp -> py. */
double py_weight(void)
{
    init_once();
    if (g_weight == NULL) {
        return 1.0;
    }

    PyGILState_STATE gil = PyGILState_Ensure();
    double out = unwrap(PyObject_CallNoArgs(g_weight));
    PyGILState_Release(gil);
    return out;
}
