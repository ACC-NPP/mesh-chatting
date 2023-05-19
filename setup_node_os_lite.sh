sudo apt-get update && sudo apt-get -y upgrade
sudo apt-get install -y npm
sudo npm install -g n
sudo n latest
hash -r
sudo apt-get install -y batctl
sudo apt-get install -y alfred

sudo raspi-config nonint do_wifi_country RU

sudo tee /etc/network/interfaces.d/wlan0 << END
auto wlan0
iface wlan0 inet manual
    wireless-channel 1
    wireless-essid tractorok-mesh
    wireless-mode ad-hoc
END

sudo tee -a /etc/dhcpcd.conf << END
denyinterfaces wlan0
END

tee ~/start-batman-adv.sh << END
#!/bin/bash
# batman-adv interface to use
sudo batctl if add wlan0
sudo ifconfig bat0 mtu 1468
# Tell batman-adv this is a gateway client
sudo batctl gw_mode client
# Activates batman-adv interfaces
sudo ifconfig wlan0 up
sudo ifconfig bat0 up
# Run Alfred deamon ? change inerface br0 by bat0 or wlan0 ?
#sudo alfred -i bat0 -m -p 5 > /dev/null &
# Run Web Service
cd /home/tractorok/mesh-chatting
LITE_VERSION=true npm start &
END

chmod +x ~/start-batman-adv.sh
echo 'batman-adv' | sudo tee --append /etc/modules

sudo tee /etc/rc.local << END
#!/bin/sh -e
/home/tractorok/start-batman-adv.sh &
exit 0
END

sudo reboot