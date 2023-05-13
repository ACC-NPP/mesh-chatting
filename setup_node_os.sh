sudo apt-get update && sudo apt-get -y upgrade
sudo apt-get install -y npm
sudo npm install -g n
sudo n latest
hash -r
sudo apt install hostapd
sudo systemctl unmask hostapd
sudo systemctl enable hostapd
sudo apt install dnsmasq
sudo apt-get install -y batctl
sudo apt-get install -y bridge-utils

sudo DEBIAN_FRONTEND=noninteractive apt install -y netfilter-persistent iptables-persistent
sudo tee -a /etc/dhcpcd.conf << END
interface wlan1
    static ip_address=192.168.4.1/24
    nohook wpa_supplicant
END

sudo tee /etc/sysctl.d/routed-ap.conf << END
# Enable IPv4 routing
net.ipv4.ip_forward=1
END
sudo iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
sudo netfilter-persistent save
sudo mv /etc/dnsmasq.conf /etc/dnsmasq.conf.orig
sudo tee /etc/dnsmasq.conf << END
interface=wlan1 # Listening interface
dhcp-range=192.168.4.2,192.168.4.20,255.255.255.0,24h
                # Pool of IP addresses served via DHCP
domain=wlan     # Local wireless DNS domain
address=/tractorok.wlan/192.168.4.1
                # Alias for this router
END

sudo tee /etc/hostapd/hostapd.conf << END
country_code=RU
interface=wlan1
ssid=tractorok
hw_mode=g
channel=6
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=okok1234
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
END

sudo tee /etc/network/interfaces.d/wlan0 << END
auto wlan0
iface wlan0 inet manual
    wireless-channel 1
    wireless-essid tractorok-mesh
    wireless-mode ad-hoc
END

sudo tee /etc/network/interfaces.d/eth << END
auto eth0
allow-hotplug eth0
iface eth0 inet manual
END

sudo tee -a /etc/dhcpcd.conf << END
denyinterfaces wlan0 eth0 bat0
END

tee ~/start-batman-adv.sh << END
#!/bin/bash
# batman-adv interface to use
sudo batctl if add wlan0
sudo ifconfig bat0 mtu 1468
sudo brctl addbr br0
sudo brctl addif br0 eth0 bat0
# Tell batman-adv this is a gateway client
sudo batctl gw_mode client
# Activates batman-adv interfaces
sudo ifconfig wlan0 up
sudo ifconfig bat0 up
# Restart DHCP now bridge and mesh network are up
sudo dhclient -r br0
sudo dhclient br0
END

chmod +x ~/start-batman-adv.sh
echo 'batman-adv' | sudo tee --append /etc/modules

sudo tee /etc/rc.local << END
#!/bin/sh -e
/home/tractorok/start-batman-adv.sh &
exit 0
END

sudo reboot