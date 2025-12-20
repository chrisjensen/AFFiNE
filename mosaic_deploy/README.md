# AFFiNE Custom Deploy to Coolify

Deploy a custom-built AFFiNE to Coolify with a secure internal-only container registry.

## Security Model

- **Registry is NOT exposed to the internet**
- Only accessible via:
  - Docker containers on the Coolify network (for pulls)
  - SSH tunnel from your machine (for pushes)
- **Basic auth required** - defense-in-depth even with network isolation
- Attacker would need SSH access AND registry credentials to compromise the registry

## Quick Start

```bash
# 1. Set up registry on Coolify (one-time, see below)

# 2. Configure SSH connection
cp .env.example .env
# Edit .env with your SSH_HOST

# 3. Build and deploy
./deploy.sh
```

---

## Part 1: Set Up Internal Registry on Coolify

### 1.1 Deploy Registry Service

In Coolify UI:

1. Go to **Projects** → **Add New Resource** → **Docker Compose**
2. Create a new project named "Container Registry"
3. Copy contents of `registry-compose.yaml` into Coolify
4. **Important**: Do NOT configure a public domain - leave network settings default
5. Deploy

The registry is now running internally with no public access.

### 1.2 Create Registry Credentials

SSH into your Coolify server and create the htpasswd file:

```bash
# Install htpasswd if needed (usually available via apache2-utils)
apt-get update && apt-get install -y apache2-utils

# Create credentials (replace YOUR_USERNAME and YOUR_PASSWORD)
docker exec docker-registry sh -c "mkdir -p /auth"
docker exec docker-registry sh -c "htpasswd -Bbn YOUR_USERNAME YOUR_PASSWORD > /auth/htpasswd"

# Restart registry to pick up auth config
docker restart docker-registry
```

**Important**: Save these credentials - you'll need them in your local `.env` file.

### 1.3 Verify Registry is Running

SSH into your Coolify server:

```bash
# Check registry is running
docker ps | grep registry

# Test internal access (with auth)
docker exec -it docker-registry wget -q -O- --user YOUR_USERNAME --password YOUR_PASSWORD http://localhost:5000/v2/_catalog
# Should return: {"repositories":[]}
```

### 1.4 Verify Network Configuration

The registry must be on the `coolify` network:

```bash
# On Coolify server
docker network inspect coolify | grep docker-registry
```

If not connected, connect it:
```bash
docker network connect coolify docker-registry
```

---

## Part 2: Configure Local Environment

### 2.1 Create Environment File

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# Your SSH connection to Coolify
SSH_HOST=root@your-coolify-server.com

# Registry credentials (same as created in step 1.2)
REGISTRY_USER=your_username
REGISTRY_PASSWORD=your_password
```

### 2.2 Ensure SSH Key Access

```bash
# Test SSH connection
ssh root@your-coolify-server.com echo "Connected"

# If needed, copy your SSH key
ssh-copy-id root@your-coolify-server.com
```

### 2.3 Make Script Executable

```bash
chmod +x deploy.sh
```

---

## Part 3: Update Coolify AFFiNE Service

Replace your existing AFFiNE docker-compose in Coolify with the contents of `docker-compose.coolify.yaml`.

### Key Differences from Public Registry Setup

| Setting | Public Registry | Internal Registry |
|---------|-----------------|-------------------|
| Image reference | `registry.example.com/affine` | `docker-registry:5000/affine` |
| Network | Default | `coolify` (external) |
| Auth | htpasswd | htpasswd (defense-in-depth) |

### Configure Docker to Authenticate with Registry

On the Coolify server, log in to the internal registry so Docker can pull images:

```bash
# SSH to Coolify server
ssh root@your-coolify-server.com

# Login to the internal registry (use credentials from step 1.2)
docker login localhost:5000 -u YOUR_USERNAME -p YOUR_PASSWORD
```

This stores credentials in `/root/.docker/config.json` and persists across reboots.

### Environment Variables

Keep your existing variables:
- `AFFINE_REVISION` - Image tag (e.g., `latest` or git hash)
- `POSTGRES_PASSWORD`
- `AFFINE_SERVER_HOST`
- `AFFINE_SERVER_EXTERNAL_URL`

**Removed**: `REGISTRY_URL` (now hardcoded to internal address)

---

## Part 4: Deploy

### Build and Push

```bash
cd mosaic_deploy
./deploy.sh
```

The script will:
1. Build frontend and server
2. Create Docker image
3. Open SSH tunnel to Coolify server
4. Push image through tunnel to internal registry
5. Display the image tag for deployment

### Trigger Deployment in Coolify

After the build completes:

1. Go to your AFFiNE service in Coolify
2. Update `AFFINE_REVISION` to the git hash shown (or keep `latest`)
3. Click **Redeploy**

---

## How the SSH Tunnel Works

```
┌─────────────────┐     SSH Tunnel      ┌─────────────────────────────┐
│  Your Machine   │◄──────────────────►│     Coolify Server          │
│                 │     Port 5000       │                             │
│  docker push    │                     │  ┌─────────────────────┐    │
│  localhost:5000 │─────────────────────┼─►│  docker-registry    │    │
│                 │                     │  │  (internal only)    │    │
└─────────────────┘                     │  └─────────────────────┘    │
                                        │            ▲                │
                                        │            │ coolify network│
                                        │  ┌─────────┴───────────┐    │
                                        │  │  affine container   │    │
                                        │  │  pulls from         │    │
                                        │  │  docker-registry:5000│   │
                                        │  └─────────────────────┘    │
                                        └─────────────────────────────┘
```

The tunnel maps `localhost:5000` on your machine to `docker-registry:5000` inside the Coolify Docker network.

---

## Managing the SSH Tunnel

### Check if Tunnel is Running

```bash
ps aux | grep 'ssh.*5000:docker-registry'
```

### Close the Tunnel

```bash
pkill -f 'ssh.*5000:docker-registry'
```

### Manual Tunnel (for debugging)

```bash
# Foreground (see connection logs)
ssh -L 5000:docker-registry:5000 root@your-server.com

# Background
ssh -f -N -L 5000:docker-registry:5000 root@your-server.com
```

---

## Security Notes

### Why This is Secure

1. **No public attack surface** - Registry has no public ports
2. **SSH authentication required** - Only users with SSH access can push
3. **Basic auth required** - Defense-in-depth with htpasswd authentication
4. **Audit trail** - SSH access is logged on the server

### Remaining Attack Vectors

| Vector | Mitigation |
|--------|------------|
| SSH key compromise | Use SSH key passphrase, hardware keys |
| Server compromise | Standard server hardening, updates |
| Local machine compromise | Attacker could push if tunnel is open |

### Best Practices

- Use SSH key authentication (not passwords)
- Consider SSH key passphrase
- Close tunnel after deployments: `pkill -f 'ssh.*5000:docker-registry'`
- Monitor SSH access logs on server
- Use a strong, unique password for registry authentication
- Rotate registry credentials periodically

---

## Data Safety

Your existing workspace data is preserved in these volumes:

| Volume | Contents |
|--------|----------|
| `postgres-data` | All documents and workspaces |
| `${UPLOAD_LOCATION}` | File attachments |
| `${CONFIG_LOCATION}` | Server configuration, private keys |

These volumes are **not touched** by the deployment process.

---

## Troubleshooting

### SSH tunnel fails to connect

```bash
# Test basic SSH
ssh root@your-server.com echo "OK"

# Check if port 5000 is free locally
lsof -i :5000

# Try different local port
LOCAL_REGISTRY_PORT=5001 ./deploy.sh
```

### Push fails with "connection refused"

```bash
# Verify tunnel is running
ps aux | grep 'ssh.*5000'

# Test registry through tunnel (with auth)
curl -u YOUR_USERNAME:YOUR_PASSWORD http://localhost:5000/v2/_catalog

# Check registry is running on server
ssh root@your-server.com docker ps | grep registry
```

### Push fails with "authentication required" or "unauthorized"

```bash
# Verify credentials in .env match those on server
# Re-run docker login
echo "$REGISTRY_PASSWORD" | docker login localhost:5000 -u "$REGISTRY_USER" --password-stdin

# On server, verify htpasswd file exists
ssh root@your-server.com docker exec docker-registry cat /auth/htpasswd
```

### Image pull fails in Coolify

```bash
# SSH to server and check Docker is logged in to registry
cat /root/.docker/config.json | grep docker-registry

# If not logged in, authenticate
docker login docker-registry:5000 -u YOUR_USERNAME -p YOUR_PASSWORD

# Test pull
docker pull docker-registry:5000/affine:latest

# Verify network connectivity
docker exec affine-app ping docker-registry

# Check coolify network
docker network inspect coolify
```

### Registry not on coolify network

```bash
# On Coolify server
docker network connect coolify docker-registry
docker restart docker-registry
```

---

## Files

| File | Purpose |
|------|---------|
| `deploy.sh` | Build and push via SSH tunnel |
| `.env.example` | Example SSH configuration |
| `.env` | Your SSH config (gitignored) |
| `docker-compose.coolify.yaml` | AFFiNE service using internal registry |
| `registry-compose.yaml` | Internal registry service |
