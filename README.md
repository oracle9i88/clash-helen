# ClashHelen

<p align="center">
  <img src="resources/icon.png" width="128" height="128" alt="ClashHelen">
</p>

<p align="center">
  <strong>Ubuntu 原生代理客户端 · Native proxy client for Ubuntu</strong><br>
  Powered by <a href="https://github.com/MetaCubeX/mihomo">Mihomo (Clash.Meta)</a> core · Electron + React · TypeScript
</p>

<p align="center">
  <a href="#-installation--安装">English</a> ·
  <a href="#快速上手">中文</a>
</p>

---

## Features · 功能

| Feature | 功能 |
|---|---|
| **TUN Mode** — capture all system traffic | **TUN 模式** — 接管全系统流量 |
| **System Proxy** — GNOME/KDE/gsettings integration | **系统代理** — 自动配 GNOME/KDE gsettings |
| **SOCKS5 / HTTP / Mixed proxy ports** | **本地代理端口** — 7890/7891/7892 |
| **Subscription management** — URL + URI paste import | **订阅管理** — URL 订阅 + URI 粘贴导入 |
| **URI batch import** — vmess/vless/trojan/ss/hy2/tuic | **URI 批量导入** — 支持全协议 |
| **Rule / Global / Direct routing modes** | **路由模式** — 规则 / 全局 / 直连 |
| **Real-time traffic monitor** | **实时流量监控** |
| **DNS** — DoH / DoT / Fake-IP | **DNS** 配置 |
| **Override scripts** — JS / YAML config patching | **覆写脚本** — 自定义配置 |
| **Hysteria 2 port hopping** | **Hysteria 2 端口跳跃** |
| **System tray + global shortcuts** | **系统托盘 + 全局快捷键** |
| **Auto-start on boot** | **开机自启** |
| **5 UI languages** (zh-CN, zh-TW, en-US, fa, ru) | **5 种语言界面** |

---

## Supported Protocols · 支持协议

`VLESS` · `VMess` · `Trojan` · `Shadowsocks` · `Hysteria 2` · `TUIC` · `WireGuard` · and all [Mihomo](https://github.com/MetaCubeX/mihomo) protocols

---

## System Requirements · 系统要求

| Item | 要求 |
|---|---|
| OS | Ubuntu 20.04 / 22.04 / 24.04, Debian 11+, Linux Mint 20+ |
| Architecture | x86_64 (amd64) · ARM64 (aarch64) |
| Desktop | GNOME, KDE Plasma, XFCE, or any desktop with system tray |
| RAM | 200 MB+ |

---

## Installation · 安装

### Option 1 — DEB Package (Recommended · 推荐)

```bash
# Download from Releases page
wget https://github.com/oracle9i88/clash-helen/releases/latest/download/clash-helen-linux-x64.deb

# Install
sudo dpkg -i clash-helen-linux-x64.deb
sudo apt install -f        # fix missing dependencies if any
```

Launch: `clash-helen` or find it in the application menu.

### Option 2 — AppImage (No install required · 免安装)

```bash
wget https://github.com/oracle9i88/clash-helen/releases/latest/download/clash-helen-linux-x64.AppImage
chmod +x clash-helen-linux-x64.AppImage
./clash-helen-linux-x64.AppImage
```

### Option 3 — RPM (Fedora / openSUSE)

```bash
sudo rpm -i clash-helen-linux-x64.rpm
```

### ARM64 (Raspberry Pi 4 / Oracle Ampere / etc.)

Replace `x64` with `arm64` in all download URLs above.

### Runtime Dependencies

If the app fails to start with missing library errors:

```bash
sudo apt install libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 \
  xdg-utils at-spi2-core libsecret-1-0 libgbm1
```

---

## Quick Start · 快速上手

### 1. Launch · 启动

```bash
clash-helen
```

An icon appears in the **system tray**. Click it to open the main window.

### 2. Import Subscription · 导入订阅

**From a subscription URL · 订阅链接**

1. Open main window → **Profiles** page
2. Paste your Clash/Mihomo subscription URL in the input box → **Import**
3. Auto-update interval can be set per profile

**From proxy URIs · 直接粘贴 URI**

1. Click the **link icon** (🔗) next to the **+** button
2. Paste one or more URIs (vmess://, vless://, trojan://, ss://, hysteria2://, tuic://)
3. Preview detected proxies → **Import**

**From a local YAML file · 本地文件**

Drag & drop a `.yaml` file onto the Profiles page, or use **+ → Open File**.

### 3. Enable Proxy · 开启代理

**System Proxy (browser, most apps) · 系统代理**

Toggle **Sys Proxy** in the sidebar or tray menu.
- Sets GNOME/KDE system proxy automatically (`gsettings`)
- Port: `7890` (HTTP/HTTPS + SOCKS5 mixed)

**TUN Mode (all traffic) · TUN 模式**

Toggle **TUN** in the sidebar or tray menu.
- Captures 100% of system traffic (no per-app config needed)
- Requires permission on first use (polkit dialog)

**Terminal / CLI · 命令行**

```bash
export HTTP_PROXY=http://127.0.0.1:7890
export HTTPS_PROXY=http://127.0.0.1:7890
export ALL_PROXY=socks5://127.0.0.1:7891
```

Or click **Copy Env** in the tray menu.

### 4. Route Mode · 路由模式

| Mode | 说明 |
|---|---|
| **Rule** 规则 | Route by domain / IP / GeoIP rules (recommended) |
| **Global** 全局 | All traffic through proxy |
| **Direct** 直连 | Bypass proxy entirely |

Switch from tray menu or the top of the main window.

---

## Proxy Ports · 代理端口

| Port | Protocol | Usage |
|---|---|---|
| **7890** | Mixed (HTTP + SOCKS5) | System proxy, browser, curl |
| **7891** | SOCKS5 | SOCKS clients |
| **7892** | HTTP | HTTP-only clients |
| **9090** | REST API | Mihomo dashboard (browser: `http://127.0.0.1:9090/ui`) |

Ports configurable in **Core** page.

---

## Proxy URI Formats · URI 格式

```
vmess://base64encodedJson
vless://uuid@host:port?security=reality&sni=example.com&fp=chrome#Name
trojan://password@host:port?sni=example.com#Name
ss://BASE64(method:pass)@host:port#Name
hysteria2://password@host:port?sni=example.com&insecure=1#Name
hy2://password@host:port#Name
tuic://uuid:password@host:port?congestion_control=bbr#Name
```

---

## TUN Mode · TUN 模式详解

TUN mode creates a virtual network interface that captures all system traffic without per-app proxy configuration.

**Permission setup (automatic on first use):**

```bash
# Done automatically by postinst / polkit. For manual setup:
sudo setcap cap_net_admin,cap_net_bind_service=+ep \
  /opt/clash-helen/resources/sidecar/mihomo
```

If TUN fails: **Core page → Grant Core Permissions** → enter your password.

---

## Hysteria 2 Port Hopping · Hysteria 2 端口跳跃

Rotates the UDP destination port periodically to bypass ISP throttling.

**Client (ClashHelen):**

1. Core page → **Hysteria 2 Port Hopping** → toggle on
2. Set **Port Range**: `20000-40000` (match server config)
3. Set **Hop Interval**: `30` seconds

**Server (iptables DNAT):**

```bash
# Forward hop range → actual Hysteria 2 port (e.g. 443)
iptables -t nat -A PREROUTING -i eth0 -p udp \
  --dport 20000:40000 -j DNAT --to-destination :443

# Persist
sudo apt install iptables-persistent && sudo netfilter-persistent save
```

---

## Build from Source · 从源码构建

### Prerequisites

```bash
# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# pnpm
npm install -g pnpm@10
```

### Build

```bash
git clone https://github.com/oracle9i88/clash-helen.git
cd clash-helen
pnpm install
pnpm prepare          # download mihomo core binaries
pnpm build:linux      # build .deb, .rpm, .AppImage → dist/
```

### Development

```bash
pnpm dev              # hot-reload dev mode
```

---

## Configuration · 配置文件

| Path | Content |
|---|---|
| `~/.config/clash-helen/config.yaml` | App settings |
| `~/.config/clash-helen/mihomo.yaml` | Controlled mihomo config |
| `~/.config/clash-helen/profiles/` | Downloaded subscription profiles |
| `~/.config/clash-helen/override/` | Override scripts |
| `~/.config/clash-helen/logs/` | App + core logs |
| `/opt/clash-helen/` | Installed application files |

---

## Troubleshooting · 故障排查

**App won't start**

```bash
clash-helen --no-sandbox    # see error output
ps aux | grep clash-helen   # check for duplicate instance
```

**TUN mode fails**

```bash
# Check capabilities
getcap /opt/clash-helen/resources/sidecar/mihomo
# Expected: cap_net_admin,cap_net_bind_service=ep

# Re-grant
sudo setcap cap_net_admin,cap_net_bind_service=+ep \
  /opt/clash-helen/resources/sidecar/mihomo
```

**System proxy not working in GNOME**

```bash
# Check gsettings state
gsettings get org.gnome.system.proxy mode
# Should return: 'manual'

gsettings get org.gnome.system.proxy.http host
# Should return: '127.0.0.1'
```

**Terminal ignores system proxy**

```bash
# Add to ~/.bashrc or ~/.zshrc:
export HTTP_PROXY=http://127.0.0.1:7890
export HTTPS_PROXY=http://127.0.0.1:7890
export ALL_PROXY=socks5://127.0.0.1:7891
```

**Subscription download fails**

- Enable **Use Proxy** on the profile card (uses current proxy to download)
- Increase timeout: Settings → Subscription Timeout

---

## Keyboard Shortcuts · 全局快捷键

Go to **Settings → Shortcuts** to configure. Defaults:

| Action | 说明 |
|---|---|
| Toggle window | 显示/隐藏主窗口 |
| Toggle system proxy | 开关系统代理 |
| Toggle TUN | 开关 TUN 模式 |
| Rule / Global / Direct mode | 切换路由模式 |
| Copy env vars | 复制代理环境变量 |
| Light mode | 退出界面但保持内核运行 |

---

## Credits · 致谢

- [Mihomo (MetaCubeX)](https://github.com/MetaCubeX/mihomo) — Proxy core engine
- [Mihomo Party](https://github.com/mihomo-party-org/mihomo-party) — UI foundation

## License · 许可证

[GPL-3.0](LICENSE)
