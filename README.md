# multi-dependency-example

Три проекта — на C++, Rust и Go — где **каждый зависит от другого**. Зависимость
не цепочка, а настоящее кольцо:

```
        libcppcore (C++)  ──link──▶  librustcore (Rust)
              ▲                            │
              │                          link
            link                           ▼
              └────────────────────  libgocore (Go)
```

Каждая библиотека экспортирует одну функцию с C ABI:

```c
double cpp_step (double value, int hops);   /* C++  */
double rust_step(double value, int hops);   /* Rust */
double go_step  (double value, int hops);   /* Go   */
```

Стадия преобразует значение и, пока счётчик прыжков не исчерпан, передаёт его
следующему языку. Так цикл виден не только в графе линковки, но и в рантайме.

## Сборка и запуск

Нужны `cargo`, `go` и `cmake` + компилятор C++17.

```sh
./build.sh

./dist/bin/cpp-demo   1 6     # входит в кольцо со стадии Rust
./dist/bin/rust-demo  2 8     # входит в кольцо со стадии C++
```

Вывод `cpp-demo 1 6`:

```
cpp-demo: entering the ring at the Rust stage
          value=1.0000 hops=6

  [rust] hops=6      1.0000 ->     2.5000   (v * 1.5 + 1)
  [go  ] hops=5      2.5000 ->     8.2500   (v / 2 + 7)
  [cpp ] hops=4      8.2500 ->     8.7785   (hypot(v, 3))
  [rust] hops=3      8.7785 ->    14.1678   (v * 1.5 + 1)
  [go  ] hops=2     14.1678 ->    14.0839   (v / 2 + 7)
  [cpp ] hops=1     14.0839 ->    14.3999   (hypot(v, 3))
  [rust] hops=0     14.3999 ->    22.5998   (v * 1.5 + 1)

cpp-demo: result = 22.5998
```

Очистка: `rm -rf dist cpp/build rust/target`.

## Как вообще собирается цикл

Циклическая зависимость не может быть разрешена «в лоб»: чтобы слинковать
первую библиотеку, нужна третья, которой ещё нет. Приём — разорвать кольцо
ровно в одном месте, оставив один символ неразрешённым до загрузки процесса:

1. **Go → `libgocore`.** Собирается первой. Символ `cpp_step` намеренно
   оставлен неразрешённым (`-Wl,-U,_cpp_step` на macOS,
   `-Wl,--unresolved-symbols=ignore-all` на Linux). cgo по умолчанию не
   пропускает такие флаги, поэтому `build.sh` выставляет `CGO_LDFLAGS_ALLOW`.
2. **Rust → `librustcore`.** Линкуется с `libgocore` обычным образом
   (`build.rs` добавляет `-L dist/lib -l gocore`).
3. **C++ → `libcppcore`.** Линкуется с `librustcore` — кольцо замкнуто.
4. Когда исполняемый файл стартует, dyld/ld.so загружает все три библиотеки, и
   висевший `cpp_step` находится в `libcppcore`.

Проверить граф можно так:

```sh
otool -L dist/lib/librustcore.dylib   # -> @rpath/libgocore.dylib
otool -L dist/lib/libcppcore.dylib    # -> @rpath/librustcore.dylib
nm -u  dist/lib/libgocore.dylib | grep cpp_step   # -> _cpp_step (undefined)
```

Порядок из `build.sh` — единственный рабочий; поменять местами шаги 1–3 нельзя.

## Структура

```
go/gocore.go            libgocore   — c-shared, //export go_step, cgo-вызов cpp_step
rust/core/              librustcore — cdylib, #[no_mangle] rust_step, extern go_step
rust/core/build.rs      линковка с libgocore, install_name/rpath
rust/demo/              rust-demo   — входит в кольцо через cpp_step
cpp/include/ring/ring.h общий C ABI кольца
cpp/src/cppcore.cpp     libcppcore  — cpp_step, вызывает rust_step
cpp/src/demo.cpp        cpp-demo    — входит в кольцо через rust_step
build.sh                сборка в правильном порядке, артефакты в dist/
```

Все библиотеки складываются в `dist/lib`, чтобы каждому тулчейну хватило одного
`-L`/rpath, а исполняемые файлы — в `dist/bin` с rpath на `dist/lib`.

## Замечания

* Проверено на macOS (arm64, clang 21, rustc 1.96, go 1.26). Флаги для Linux
  прописаны, но там не проверялось; на Windows схема потребует `.def`-файлов
  или dllimport-обвязки — «неразрешённых до запуска» символов в PE нет.
* На macOS двухуровневое пространство имён: символы не «протекают» через
  промежуточную библиотеку, поэтому `cpp-demo` линкуется и с `libcppcore`, и с
  `librustcore` — он зовёт `rust_step` напрямую.
* Отдельного демо на Go нет намеренно: исполняемый файл Go, слинкованный с
  `libgocore`, получил бы два рантайма Go в одном процессе.
