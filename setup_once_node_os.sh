sudo apt-get update && sudo apt-get -y upgrade
sudo apt-get install -y npm
sudo npm install -g n
sudo n latest
hash -r
sudo apt-get install -y batctl
sudo apt-get install -y alfred
sudo apt-get install -y iperf

# WARNING: this is a OS-specific line, should be different for different OSes, for example RPI OS, OrangePi OS, TinkeOS, DietPi, Armbian etc.
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
# Run Alfred deamon
sleep 4
sudo alfred -i wlan0 -m -p 5 > /dev/null &
sleep 2
# Run iperf deamon
iperf -s -V -D
# Run Web Service
cd /home/tractorok/mesh-chatting
npm start &
END

chmod +x ~/start-batman-adv.sh
echo 'batman-adv' | sudo tee --append /etc/modules

sudo tee /etc/rc.local << END
#!/bin/sh -e
/home/tractorok/start-batman-adv.sh &
exit 0
END

cd /home/tractorok/mesh-chatting
npm install

sudo reboot