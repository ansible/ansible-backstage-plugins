"""Generate the TLS certificates for the portal demo (dev/tls).

Run from the repository root:  python3 dev/tls/generate-certs.py

Produces, into dev/tls/certs (gitignored):
  demo-ca.pem / demo-ca-key.pem
      The "organisational" CA. The Portal trusts it through the registry's
      caFile setting — verification stays on.
  demo-trusted-server.pem / demo-trusted-server-key.pem
      Signed by demo-ca, valid for host.containers.internal (and loopback).
      Served on :8443 — the verified-HTTPS case that must succeed.
  demo-untrusted-ca.pem
      Signs nothing the Portal trusts; exists to make the story concrete.
  demo-untrusted-server.pem / demo-untrusted-server-key.pem
      Signed by demo-untrusted-ca. Served on :8444 — the case the Portal
      must refuse with a certificate error.

SANs cover host.containers.internal (how containers reach the host under
podman), localhost and 127.0.0.1 (host-side curl smoke tests), and the
host's primary LAN IP — the fallback when the podman host-gateway
(169.254.1.2) is unreachable from containers, which happens after rootless
network recreation on some firewalld setups.
"""

import socket
from datetime import datetime, timedelta, timezone
from ipaddress import IPv4Address
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

NOW = datetime.now(timezone.utc)
HERE = Path(__file__).parent / "certs"


def generate_key() -> rsa.RSAPrivateKey:
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def write(path: str, data: bytes) -> None:
    (HERE / path).write_bytes(data)


def write_key(name: str, key: rsa.RSAPrivateKey) -> None:
    write(
        f"{name}-key.pem",
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption(),
        ),
    )


def write_cert(name: str, cert: x509.Certificate) -> None:
    write(f"{name}.pem", cert.public_bytes(serialization.Encoding.PEM))


def common_name(cn: str) -> x509.Name:
    return x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, cn)])


def make_ca(name: str, cn: str) -> tuple[rsa.RSAPrivateKey, x509.Certificate]:
    key = generate_key()
    cert = (
        x509.CertificateBuilder()
        .subject_name(common_name(cn))
        .issuer_name(common_name(cn))
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(NOW - timedelta(days=1))
        .not_valid_after(NOW + timedelta(days=3650))
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )
    write_key(name, key)
    write_cert(name, cert)
    return key, cert


def make_server_cert(
    name: str,
    cn: str,
    san: list[x509.GeneralName],
    ca_key: rsa.RSAPrivateKey,
    ca_cert: x509.Certificate,
) -> None:
    key = generate_key()
    builder = (
        x509.CertificateBuilder()
        .subject_name(common_name(cn))
        .issuer_name(ca_cert.subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(NOW - timedelta(days=1))
        .not_valid_after(NOW + timedelta(days=3650))
        .add_extension(x509.SubjectAlternativeName(san), critical=False)
    )
    write_key(name, key)
    write_cert(name, builder.sign(ca_key, hashes.SHA256()))


HERE.mkdir(parents=True, exist_ok=True)

def primary_lan_ip() -> str | None:
    """Source IP the host would use for outbound traffic (no packet sent)."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
    except OSError:
        return None


host_san = [
    x509.DNSName("host.containers.internal"),
    x509.DNSName("localhost"),
    x509.IPAddress(IPv4Address("127.0.0.1")),
]
lan_ip = primary_lan_ip()
if lan_ip and lan_ip != "127.0.0.1":
    host_san.append(x509.IPAddress(IPv4Address(lan_ip)))

ca_key, ca_cert = make_ca("demo-ca", "automation-content demo CA")
make_server_cert("demo-trusted-server", "host.containers.internal", host_san, ca_key, ca_cert)

untrusted_key, untrusted_cert = make_ca(
    "demo-untrusted-ca", "automation-content demo UNTRUSTED CA"
)
make_server_cert(
    "demo-untrusted-server", "host.containers.internal", host_san, untrusted_key, untrusted_cert
)

print("generated demo certificates in", HERE)
