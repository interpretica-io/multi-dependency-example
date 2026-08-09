# multi-dependency-example

Пять проектов — на C++, Rust, Go, C# и Python — где **каждый зависит от двух
других**. Не цепочка и не одно кольцо, а плотный циклический граф: 5 узлов,
10 рёбер, у каждого узла исходящая и входящая степень 2.

```
                         ┌──────────────► cpp ◄─────────────┐
                         │              ╱   ╲               │
                         │         ring╱     ╲chord         │
                         │            ▼       ▼             │
                        go ◄────── rust      py ──────────► go
                         │ ring       ╲      ▲               │
                         │             ╲    ╱ ring           │
                         │        chord ▼  ╱                 │
                         └────────────► cs ◄─────────────────┘
                                        chord
```

Читается проще по двум спискам рёбер:

| ребро | вызов | связь |
|---|---|---|
| **ring** `X_step` | cpp → rust → go → cs → py → cpp | шаг конвейера, передаёт значение дальше |
| **chord** `X_weight` | cpp → py, rust → cs, go → cpp, cs → rust, py → go | коэффициент, которым стадия домножает результат |

Каждый проект экспортирует две функции с C ABI:

```c
double X_step(double value, int hops);   /* передаёт значение следующему языку */
double X_weight(void);                   /* лист: обратно в кольцо не заходит */
```

`X_step` преобразует значение, домножает на вес, полученный от «хордового»
соседа, и, пока счётчик прыжков не исчерпан, отдаёт следующему языку. `X_weight`
— лист, именно поэтому вся конструкция завершается.

## Сборка и запуск

Нужны `cmake` + компилятор C++17, `cargo`, `go`, .NET SDK 9+ (NativeAOT),
Python 3 с заголовками для встраивания (`python3-config --embed`).

```sh
./build.sh              # сборка
./build.sh clean        # удалить всё собранное
./build.sh rebuild      # clean + сборка

./dist/bin/cpp-demo   1 7      # входит в кольцо со стадии Rust
./dist/bin/rust-demo  2 4      # входит в кольцо со стадии C++
python3 python/demo.py 1 5     # входит из работающего интерпретатора
```

`clean` отдаёт очистку самим тулчейнам (`cargo clean`, `go clean`, цель `clean`
у CMake), а затем сносит `cpp/build`, `csharp/{bin,obj,out}`, `__pycache__` и
общий `dist/`.

Вывод `cpp-demo 1 7` (на исходном коде без внесённых дефектов, см. ниже):

```
cpp-demo: entering the ring at the Rust stage
          value=1.0000 hops=7

  [rust] hops=7      1.0000 ->     2.6000   ((v * 1.5 + 1) * cs_weight)
  [go  ] hops=6      2.6000 ->     8.3830   ((v / 2 + 7) * cpp_weight)
  [cs  ] hops=5      8.3830 ->    10.5907   ((v + 2) * rust_weight)
  [py  ] hops=4     10.5907 ->    11.8167   ((v * 0.8 + 3) * go_weight)
  [cpp ] hops=3     11.8167 ->    12.8012   (hypot(v, 3) * py_weight)
  [rust] hops=2     12.8012 ->    21.0098   ((v * 1.5 + 1) * cs_weight)
  [go  ] hops=1     21.0098 ->    17.6799   ((v / 2 + 7) * cpp_weight)
  [cs  ] hops=0     17.6799 ->    20.0735   ((v + 2) * rust_weight)

cpp-demo: result = 20.0735
```

## Как собирается циклический граф

Циклическую зависимость нельзя разрешить «в лоб»: чтобы слинковать первую
библиотеку, нужна последняя, которой ещё нет. Здесь работают два приёма.

**1. Языки с поздним связыванием идут первыми.** Python и C# разрешают свои
исходящие вызовы в рантайме, а не на линковке, поэтому у них вообще нет
build-time зависимостей от кольца:

* Python зовёт `ctypes.CDLL(None)` — это открывает сам процесс, и любой уже
  загруженный символ кольца доступен по имени;
* C# зовёт `dlsym(RTLD_DEFAULT, "...")` и вызывает результат через
  `delegate* unmanaged[Cdecl]`, поэтому в `[DllImport]` не приходится зашивать
  ни одного пути.

**2. Оставшийся нативный цикл разрывается одним неразрешённым символом.** После
Python и C# остаётся цикл `cpp → rust → go → cpp`. Go собирается третьим и
намеренно оставляет `cpp_weight` неразрешённым (`-Wl,-U,_cpp_weight` на macOS,
`-Wl,--unresolved-symbols=ignore-all` на Linux); cgo по умолчанию не пропускает
такие флаги, поэтому `build.sh` выставляет `CGO_LDFLAGS_ALLOW`. Символ находится
при старте процесса, когда dyld загружает `libcppcore`.

Отсюда единственно возможный порядок сборки:

| # | проект | линкуется с | не разрешено на этапе линковки |
|---|---|---|---|
| 1 | Python → `libpycore` | только libpython | всё кольцо (ctypes) |
| 2 | C# → `libcscore` | ничего | всё кольцо (dlsym) |
| 3 | Go → `libgocore` | libcscore | `cpp_weight` |
| 4 | Rust → `librustcore` | libgocore, libcscore | — |
| 5 | C++ → `libcppcore` | librustcore, libpycore | — |

Проверить граф:

```sh
otool -L dist/lib/librustcore.dylib          # -> libgocore, libcscore
otool -L dist/lib/libcppcore.dylib           # -> librustcore, libpycore
nm -u  dist/lib/libgocore.dylib | grep cpp_  # -> _cpp_weight (undefined)
```

## Структура

```
python/ring_stage.py    стадия Python; наружу — через ctypes.CDLL(None)
python/src/pycore.c     libpycore — C-хост, встраивает CPython и экспортирует
                        py_step / py_weight (сам Python C-символы не отдаёт)
python/demo.py          вход в кольцо из обычного интерпретатора
csharp/RingStage.cs     libcscore — NativeAOT, [UnmanagedCallersOnly] наружу,
                        dlsym(RTLD_DEFAULT) внутрь
csharp/cscore.csproj    PublishAot + NativeLib=Shared + install_name
go/gocore.go            libgocore — c-shared, //export, cgo-вызовы cs_step/cpp_weight
rust/core/              librustcore — cdylib, #[no_mangle], extern go_step/cs_weight
rust/core/build.rs      линковка с libgocore и libcscore, install_name/rpath
rust/demo/              rust-demo — вход в кольцо через cpp_step
cpp/include/ring/ring.h общий C ABI всех десяти функций
cpp/src/cppcore.cpp     libcppcore — cpp_step/cpp_weight
cpp/src/demo.cpp        cpp-demo — вход в кольцо через rust_step
build.sh                сборка в правильном порядке + clean/rebuild, вывод в dist/
```

Все библиотеки складываются в `dist/lib`, чтобы каждому тулчейну хватило одного
`-L`/rpath, а исполняемые файлы — в `dist/bin` с rpath на `dist/lib`.

## Замечания

* Проверено на macOS (arm64, Apple clang 21, rustc 1.96, go 1.26, .NET 9,
  Python 3.14). Флаги для Linux прописаны, но там не проверялись; на Windows
  схема потребует `.def`-файлов или dllimport-обвязки — «неразрешённых до
  запуска» символов в PE нет.
* `python/demo.py` грузит `libcppcore` с `RTLD_GLOBAL`. Это не косметика: плоское
  пространство имён, через которое разрешается `cpp_weight`, видит только
  глобально загруженные образы, и со значением по умолчанию (`RTLD_LOCAL`)
  `dlopen` падает с `symbol not found in flat namespace '_cpp_weight'`.
* На macOS двухуровневое пространство имён: символы не «протекают» через
  промежуточную библиотеку, поэтому `cpp-demo` линкуется и с `libcppcore`, и с
  `librustcore` — он зовёт `rust_step` напрямую.
* Отдельных демо на Go и C# нет намеренно: исполняемый файл Go, слинкованный с
  `libgocore`, получил бы два рантайма Go в одном процессе — то же самое с
  NativeAOT-бинарём и `libcscore`.
* ILCompiler вызывает `clang` по имени; `build.sh` явно указывает
  `/usr/bin/clang`, иначе конфиг Homebrew LLVM уводит линковку на не
  установленный SDK.
* **В каждый файл с кодом намеренно внесено по одной тривиальной ошибке**
  (всегда истинное условие вида `if (5)` / `if true`) — репозиторий используется
  как корпус для проверки инструментов ревью. Из-за них кольцо на запуске
  обрывается на первой же стадии; эталонный вывод выше снят на коде без них.
