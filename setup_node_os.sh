sudo apt-get update && sudo apt-get -y upgrade
sudo apt-get install -y npm
sudo npm install -g n
sudo n latest
hash -r
sudo apt install dnsmasq
sudo apt-get install -y batctl
sudo apt-get install -y bridge-utils

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