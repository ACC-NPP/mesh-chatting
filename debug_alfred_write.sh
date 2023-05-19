hostname | tr -d '\n' | sudo alfred -s 70
ifconfig wlan0 | grep "inet6 " | awk '{print $2}' | tr -d '\n' | sudo alfred -s 71