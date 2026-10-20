"""Regenerate the committed TLS fixtures for OCITransportPolicy.test.ts.

Run from this directory:  python3 generate.py

Produces a test CA plus four server certificates, all for loopback:
  - trusted-server:   signed by the CA, valid for 127.0.0.1 — must be accepted
  - wrong-host-server: signed by the CA, valid only for wrong.example — must fail
                       hostname validation
  - expired-server:   signed by the CA, valid for 127.0.0.1, already expired
  - untrusted-server: self-signed — must fail chain validation

The test suite installs a global undici dispatcher that trusts the test CA (see
OCITransportPolicy.test.ts), which is why a self-signed peer and a CA-signed peer
fail for different, distinguishable reasons.
"""

from datetime import datetime, timedelta, timezone
from ipaddress import IPv4Address
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

NOW = datetime.now(timezone.utc)
HERE = Path(__file__).parent


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


def make_ca() -> tuple[rsa.RSAPrivateKey, x509.Certificate]:
    key = generate_key()
    cert = (
        x509.CertificateBuilder()
        .subject_name(common_name("automation-content test CA"))
        .issuer_name(common_name("automation-content test CA"))
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(NOW - timedelta(days=1))
        .not_valid_after(NOW + timedelta(days=3650))
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )
    write_key("test-ca", key)
    write_cert("test-ca", cert)
    return key, cert


def make_server_cert(
    name: str,
    cn: str,
    san: list[x509.GeneralName],
    ca_key: rsa.RSAPrivateKey,
    ca_cert: x509.Certificate,
    expired: bool = False,
) -> None:
    key = generate_key()
    builder = (
        x509.CertificateBuilder()
        .subject_name(common_name(cn))
        .issuer_name(ca_cert.subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(NOW - timedelta(days=2) if expired else NOW - timedelta(days=1))
        .not_valid_after(NOW - timedelta(days=1) if expired else NOW + timedelta(days=3650))
        .add_extension(x509.SubjectAlternativeName(san), critical=False)
    )
    write_key(name, key)
    write_cert(name, builder.sign(ca_key, hashes.SHA256()))


def make_self_signed(name: str, cn: str, san: list[x509.GeneralName]) -> None:
    key = generate_key()
    cert = (
        x509.CertificateBuilder()
        .subject_name(common_name(cn))
        .issuer_name(common_name(cn))
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(NOW - timedelta(days=1))
        .not_valid_after(NOW + timedelta(days=3650))
        .add_extension(x509.SubjectAlternativeName(san), critical=False)
        .sign(key, hashes.SHA256())
    )
    write_key(name, key)
    write_cert(name, cert)


loopback_san = [
    x509.IPAddress(IPv4Address("127.0.0.1")),
    x509.DNSName("localhost"),
]

ca_key, ca_cert = make_ca()
make_server_cert("trusted-server", "127.0.0.1", loopback_san, ca_key, ca_cert)
make_server_cert(
    "wrong-host-server", "wrong.example", [x509.DNSName("wrong.example")], ca_key, ca_cert
)
make_server_cert("expired-server", "127.0.0.1", loopback_san, ca_key, ca_cert, expired=True)
make_self_signed("untrusted-server", "127.0.0.1", loopback_san)

print("generated fixtures in", HERE)
