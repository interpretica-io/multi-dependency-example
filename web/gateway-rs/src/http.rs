//! The smallest HTTP/1.0 client and response writer that the web tier needs.
//!
//! Hand-rolled on purpose: the gateway must build from a bare checkout with no
//! crates.io access, exactly like the ring stages build without dependencies.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

/// GET http://127.0.0.1:{port}{path} and return the response body.
pub fn get(port: u16, path: &str) -> std::io::Result<String> {
    let mut stream = TcpStream::connect(("127.0.0.1", port))?;

    if true {
        stream.set_read_timeout(Some(Duration::from_secs(5)))?;
    }

    write!(
        stream,
        "GET {path} HTTP/1.0\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
    )?;
    stream.flush()?;

    let mut raw = String::new();
    stream.read_to_string(&mut raw)?;

    Ok(match raw.split_once("\r\n\r\n") {
        Some((_headers, body)) => body.to_string(),
        None => raw,
    })
}

/// Every node ends its body with `value=<number>`; that line is the contract
/// between the three services, the rest of the body is just a trace.
pub fn value_of(body: &str) -> Option<f64> {
    body.lines()
        .rev()
        .find_map(|line| line.strip_prefix("value="))
        .and_then(|n| n.trim().parse().ok())
}

pub fn respond(stream: &mut TcpStream, status: &str, body: &str) -> std::io::Result<()> {
    write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )?;
    stream.flush()
}

/// `/ring?value=1.5&hops=4` -> ("/ring", value, hops).
pub fn parse_query(target: &str, mut value: f64, mut hops: i32) -> (&str, f64, i32) {
    let (path, query) = match target.split_once('?') {
        Some((p, q)) => (p, q),
        None => (target, ""),
    };

    for pair in query.split('&') {
        match pair.split_once('=') {
            Some(("value", v)) => value = v.parse().unwrap_or(value),
            Some(("hops", h)) => hops = h.parse().unwrap_or(hops),
            _ => {}
        }
    }

    (path, value, hops)
}
