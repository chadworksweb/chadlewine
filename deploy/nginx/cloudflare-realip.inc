# Cloudflare real-visitor-IP restoration. `include`d by the chadlewine vhosts.
# Behind the Cloudflare proxy, le-nginx otherwise sees Cloudflare edge IPs as
# $remote_addr; this rewrites $remote_addr to the TRUE client from the
# (unspoofable) CF-Connecting-IP header -- but ONLY when the TCP peer is actually
# a Cloudflare address, so it can't be abused by a direct-to-origin client.
# Installed on the droplet at /root/proxy/nginx/conf.d/cloudflare-realip.inc
# (a .inc, so nginx's `include conf.d/*.conf` does NOT auto-load it at http scope;
# the chadlewine server blocks include it explicitly).
# Ranges: https://www.cloudflare.com/ips  (refresh if Cloudflare changes them).
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 131.0.72.0/22;
set_real_ip_from 2400:cb00::/32;
set_real_ip_from 2606:4700::/32;
set_real_ip_from 2803:f800::/32;
set_real_ip_from 2405:b500::/32;
set_real_ip_from 2405:8100::/32;
set_real_ip_from 2a06:98c0::/29;
set_real_ip_from 2c0f:f248::/32;
real_ip_header CF-Connecting-IP;
