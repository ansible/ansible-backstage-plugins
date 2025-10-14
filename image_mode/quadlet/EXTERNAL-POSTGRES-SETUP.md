# PostgreSQL Database Setup for RHDH

Configure PostgreSQL database for Red Hat Developer Hub (RHDH) Quadlet deployment.

> **Current Setup**: PostgreSQL container is included by default in VM deployments. This guide covers external database configuration and troubleshooting.

## Quick Setup Decision

| Scenario | Recommended Approach |
|----------|---------------------|
| **Development/Testing** | Use included PostgreSQL container (no action needed) |
| **Production** | Configure external PostgreSQL server |
| **Existing Database** | Connect to external PostgreSQL server |

## External PostgreSQL Server

### Prerequisites

- PostgreSQL 13+ server accessible from RHDH
- Database admin credentials
- Network connectivity on port 5432

### Database Setup

```sql
-- Connect as PostgreSQL superuser
CREATE DATABASE rhdh_backstage;
CREATE USER rhdh_user WITH PASSWORD 'secure_password_here';
GRANT ALL PRIVILEGES ON DATABASE rhdh_backstage TO rhdh_user;

-- Required: RHDH needs CREATE DATABASE permission for plugins
ALTER USER rhdh_user CREATEDB;
```

### Environment Configuration

Edit `rhdh.env`:

```bash
# Database Configuration
POSTGRES_HOST=your-postgres-server.example.com
POSTGRES_PORT=5432
POSTGRES_USER=rhdh_user
POSTGRES_PASSWORD=secure_password_here
POSTGRES_DB=rhdh_backstage

# Backstage Backend Configuration
BACKEND_DATABASE_CLIENT=pg
BACKEND_DATABASE_CONNECTION_HOST=${POSTGRES_HOST}
BACKEND_DATABASE_CONNECTION_PORT=${POSTGRES_PORT}
BACKEND_DATABASE_CONNECTION_USER=${POSTGRES_USER}  
BACKEND_DATABASE_CONNECTION_PASSWORD=${POSTGRES_PASSWORD}
BACKEND_DATABASE_CONNECTION_DATABASE=${POSTGRES_DB}
BACKEND_DATABASE_CONNECTION_SSL=false
```

### Application Configuration

Update `../configs/app-config/app-config.yaml`:

```yaml
backend:
  database:
    client: pg
    connection:
      host: ${POSTGRES_HOST}
      port: ${POSTGRES_PORT}
      user: ${POSTGRES_USER}
      password: ${POSTGRES_PASSWORD}
      database: ${POSTGRES_DB}
      ssl:
        require: false
      pool:
        min: 5
        max: 20
```

### Deployment

```bash
# Test connectivity first
psql -h your-postgres-server.example.com -U rhdh_user -d rhdh_backstage -c "SELECT version();"

# Deploy RHDH with external database
make build-local
make deploy-vm-local
```

## Container PostgreSQL (Default)

The included PostgreSQL container configuration:

- **Image**: `registry.redhat.io/rhel9/postgresql-15:latest`
- **Container**: `rhdh-postgres`
- **Network**: `rhdh-network` (isolated)
- **Storage**: Named volume with automatic permissions
- **User**: `postgres` (superuser for plugin database creation)

### Configuration Files

- `postgres.container` - Container definition
- `postgres.env` - Environment variables
- `rhdh.env` - RHDH database connection settings

## Troubleshooting

### Connection Issues

| Problem | Solution |
|---------|----------|
| **Connection refused** | Check PostgreSQL service status and network connectivity |
| **Authentication failed** | Verify credentials in environment files |
| **Permission denied** | Ensure user has `CREATEDB` permission or use postgres superuser |
| **SSL errors** | Set `BACKEND_DATABASE_CONNECTION_SSL=false` for development |

### Diagnostic Commands

```bash
# Check PostgreSQL container
sudo systemctl status postgres.service
sudo podman ps | grep postgres

# Test database connection
podman exec -it rhdh psql -h rhdh-postgres -U postgres -d rhdh_backstage

# Check RHDH logs for database errors
sudo journalctl -u rhdh.service | grep -i database
```

### Common Database Errors

**"permission denied to create database"**
```bash
# Solution: Use postgres superuser in rhdh.env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=secure_admin_password_123
```

**"getaddrinfo ENOTFOUND rhdh-postgres"**
```bash
# Check container networking
podman network ls
podman exec -it rhdh ping rhdh-postgres
```

## Security for Production

### Database Security

```bash
# Generate secure passwords
openssl rand -base64 32

# Enable SSL connections
BACKEND_DATABASE_CONNECTION_SSL=true
```

### Network Security

```bash
# Restrict PostgreSQL access
firewall-cmd --add-rich-rule='rule family="ipv4" source address="rhdh-container-ip" port protocol="tcp" port="5432" accept'
```

### Container Security

```ini
# Enhanced postgres.container security
[Container]
ReadOnlyRootFilesystem=true
NoNewPrivileges=true
User=26:26
Memory=1g
CPUQuota=50%
```

## Performance Tuning

### PostgreSQL Settings

Add to `postgres.env`:

```bash
POSTGRESQL_MAX_CONNECTIONS=100
POSTGRESQL_SHARED_BUFFERS=256MB
POSTGRESQL_EFFECTIVE_CACHE_SIZE=1GB
POSTGRESQL_WORK_MEM=4MB
```

### Monitoring

```bash
# Database health
podman exec rhdh-postgres pg_isready -U postgres

# Connection monitoring
curl -f http://localhost:7007/api/app/health
```

## Backup and Recovery

### Database Backup

```bash
# Create backup
podman exec rhdh-postgres pg_dump -U postgres rhdh_backstage > backup-$(date +%Y%m%d).sql

# Restore backup
podman exec -i rhdh-postgres psql -U postgres rhdh_backstage < backup-file.sql
```

## Key Configuration Points

### Critical Requirements

1. **Database Permissions**: User needs `CREATEDB` for plugin databases
2. **Network Configuration**: Containers must share `rhdh-network`  
3. **Complete Database Config**: Both environment and app-config.yaml must be configured
4. **Named Volumes**: Use Podman named volumes for automatic permissions

### Success Checklist

- [ ] PostgreSQL container/server is healthy
- [ ] Database user has CREATE DATABASE permissions
- [ ] Network connectivity between RHDH and PostgreSQL
- [ ] Complete database configuration in both files
- [ ] RHDH starts without database connection errors
- [ ] Web interface accessible

---

**For detailed troubleshooting and advanced configurations, refer to the comprehensive troubleshooting section above.**

### 📚 **Additional Resources**

- **[RHDH PostgreSQL Configuration](https://docs.redhat.com/en/documentation/red_hat_developer_hub/1.6/html/configuring_red_hat_developer_hub/configuring-external-postgresql-databases)** - Official Red Hat Developer Hub PostgreSQL setup guide
- **[RHDH High Availability](https://docs.redhat.com/en/documentation/red_hat_developer_hub/1.6/html/configuring_red_hat_developer_hub/configuring-high-availability-in-red-hat-developer-hub)** - HA configuration for production deployments