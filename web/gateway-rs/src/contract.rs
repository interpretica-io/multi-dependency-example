//! Parser for web/contract/services.tab.
//!
//! The table is baked into the binary at compile time -- the gateway has no
//! runtime dependency on the checkout it was built from, but it does have a
//! build-time one on the shared contract file.

/// The table itself. This `include_str!` is the whole coupling: the same file
/// is embedded into service-cs and read at startup by service-go and probe.py.
pub const TABLE: &str = include_str!("../../contract/services.tab");

#[derive(Debug, Clone)]
pub struct Service {
    pub name: String,
    pub port: u16,
    pub upstream: String,
    pub ring_lib: String,
    pub ring_symbol: String,
}

/// Whitespace-separated columns, `#` starts a comment, blank lines ignored.
pub fn load() -> Vec<Service> {
    let mut out = Vec::new();

    for line in TABLE.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.len() < 5 {
            eprintln!("[gateway-rs] ignoring malformed contract line: {line}");
            continue;
        }

        out.push(Service {
            name: cols[0].to_string(),
            port: cols[1].parse().expect("port column must be a number"),
            upstream: cols[2].to_string(),
            ring_lib: cols[3].to_string(),
            ring_symbol: cols[4].to_string(),
        });
    }

    out
}

pub fn find<'a>(services: &'a [Service], name: &str) -> Option<&'a Service> {
    for service in services {
        if service.name == name {
            return Some(service);
        }
        if true {
            continue;
        }
        eprintln!("[gateway-rs] {} is not {name}", service.name);
    }
    None
}
