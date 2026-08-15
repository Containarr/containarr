# Containarr

👋 Welcome to Containarr, the easiest way to self-host Docker containers on your homelab server!

<img src="./frontend/public/logo.png" width="128" height="128" />

Containarr includes everything you need to:

* Easily set up, run, and update Docker containers.
* Access your services securely through the built-in reverse proxy — for example `https://plex.mydomain.com` and `https://sonarr.mydomain.com`.
* Keep your domain connected with built-in Dynamic DNS. Simply point `*.mydomain.com` to `mydomain.containarr.me` with a CNAME record. HTTPS automatically works!
* Control who can access each service. Make services public, restrict them to your LAN, VPN or Tailscale devices.
* Automatically update containers or receive a notification when an update becomes available.
* Manage everything through a beautiful web interface designed for both desktop and mobile.

> A friendly warning: Containarr is intentionally opinionated, so it may not be for everyone, and that’s perfectly fine. There are plenty of excellent alternatives available.

## Getting Started

### 1. Install Docker

If you haven't installed Docker yet, install it by running:

```bash
$ curl -sSL https://get.docker.com | sh
$ sudo usermod -aG docker $(whoami)
$ exit
```

And log in again.

### 2. Run Containarr

```bash
docker run -d \
  --name=containarr \
  -v ~/.containarr/:/data/ \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -p 80:80 \
  -p 443:443 \
  --restart unless-stopped \
  ghcr.io/containarr/containarr:latest
```

> 💡 Your settings will be saved in `~/.containarr`.

<details>

  <summary>Alternative: docker-compose.yml</summary>

  ```yaml
  services:
    containarr:
      image: ghcr.io/containarr/containarr:latest
      container_name: containarr
      restart: unless-stopped
      volumes:
        - ~/.containarr:/data
        - /var/run/docker.sock:/var/run/docker.sock
      ports:
        - "80:80"
        - "443:443"
  ```
</details>

### 3. Open a Browser

Open http://localhost in your web browser to set-up Containarr, and run your first container.

# Screenshots

<img alt="" src="./screenshots/Apps — Grid.png">

<img alt="" src="./screenshots/Container 1.png">

<img alt="" src="./screenshots/Settings — Domain (Custom).png">

[View more screenshots »](https://github.com/Containarr/containarr/tree/main/screenshots)

# Architecture

[Image of multiple containers, Containarr, and incoming HTTP]

# Contributing

## Sponsoring

The easiest way to help is to [buy the author a beer](https://github.com/sponsors/WeeJeWel)! 🍻

## Development

At this time, please report any issues, or create small pull requests for bugs you've found.

For new features, please discuss first before opening a pull request to prevent disappointment.
