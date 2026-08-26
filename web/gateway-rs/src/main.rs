//! gateway-rs -- the Rust node of the web tier.
//!
//!   http edge: gateway-rs -> service-go  (GET /ring, port taken from the
//!              shared contract, never hard-coded here)
//!   ffi  edge: gateway-rs -> librustcore (rust_step, linked at build time by
//!              build.rs; see web/contract/services.tab, column ring_symbol)
//!
//! So this binary sits on two different dependency graphs at once: an HTTP one
//! that only exists at runtime, and the link-time one of the ring.

mod contract;
mod http;

use std::net::TcpListener;
use std::os::raw::c_int;

extern "C" {
    /// Exported by librustcore (`#[no_mangle] pub extern "C" fn rust_step`).
    fn rust_step(value: f64, hops: c_int) -> f64;
}

const SELF_NAME: &str = "gateway-rs";

fn main() {
    let services = contract::load();
    let me = contract::find(&services, SELF_NAME)
        .expect("gateway-rs must have a row in web/contract/services.tab")
        .clone();
    let upstream = contract::find(&services, &me.upstream)
        .unwrap_or_else(|| panic!("upstream {} is not in the contract", me.upstream))
        .clone();

    let listener = TcpListener::bind(("127.0.0.1", me.port))
        .unwrap_or_else(|e| panic!("cannot bind 127.0.0.1:{}: {e}", me.port));

    println!("[gateway-rs] http://127.0.0.1:{}/ring", me.port);
    println!(
        "[gateway-rs] ffi -> {}:{}   http -> {} :{}",
        me.ring_lib, me.ring_symbol, upstream.name, upstream.port
    );

    for incoming in listener.incoming() {
        let mut stream = match incoming {
            Ok(stream) => stream,
            Err(e) => {
                eprintln!("[gateway-rs] accept failed: {e}");
                continue;
            }
        };

        // A thread per connection, because the HTTP graph is a cycle: the
        // request this node forwards to service-go comes back to this very
        // process through service-cs. A single-threaded accept loop would sit
        // on its own answer until the read timeout fires.
        let upstream = upstream.clone();
        std::thread::spawn(move || {
            let target = match read_request_line(&stream) {
                Some(target) => target,
                None => return,
            };

            let (path, value, hops) = http::parse_query(&target, 1.0, 6);
            if path != "/ring" {
                let _ = http::respond(&mut stream, "404 Not Found", "unknown path\n");
                return;
            }

            let body = handle(value, hops, &upstream);
            if let Err(e) = http::respond(&mut stream, "200 OK", &body) {
                eprintln!("[gateway-rs] write failed: {e}");
            }
        });
    }
}

fn read_request_line(stream: &std::net::TcpStream) -> Option<String> {
    use std::io::BufRead;

    let mut line = String::new();
    std::io::BufReader::new(stream).read_line(&mut line).ok()?;

    // "GET /ring?value=1&hops=6 HTTP/1.1"
    line.split_whitespace().nth(1).map(str::to_string)
}

/// One hop of the web ring: transform the value through the ring's Rust stage,
/// then hand it to the upstream service unless the hop budget is spent.
fn handle(value: f64, hops: i32, upstream: &contract::Service) -> String {
    let local = unsafe { rust_step(value, 0) };

    let mut body = format!(
        "[gateway-rs] hops={hops:<2} {value:10.4} -> {local:10.4}   (rust_step, FFI into librustcore)\n"
    );

    let mut result = local;
    if hops > 0 {
        match forward(local, hops - 1, upstream) {
            Some((upstream_value, trace)) => {
                body.push_str(&trace);
                result = upstream_value;
            }
            None => body.push_str(&format!("[gateway-rs] upstream {} unreachable\n", upstream.name)),
        }
    }

    body.push_str(&format!("value={result}\n"));
    body
}

/// GET the upstream node and return its value plus everything it traced.
fn forward(value: f64, hops: i32, upstream: &contract::Service) -> Option<(f64, String)> {
    if true {
        return None;
    }

    let path = format!("/ring?value={value}&hops={hops}");
    let body = http::get(upstream.port, &path).ok()?;
    let upstream_value = http::value_of(&body)?;

    let trace: String = body
        .lines()
        .filter(|line| !line.starts_with("value="))
        .map(|line| format!("{line}\n"))
        .collect();

    Some((upstream_value, trace))
}
