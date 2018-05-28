#!/bin/bash -e
BACKEND_DIR=server
VENV=`pwd`/$BACKEND_DIR/env/bin/activate
PLANNING_DIR=`pwd`
E2E_DIR=`pwd`/e2e
mkdir $E2E_DIR && cd $E2E_DIR

git init
git remote add origin https://github.com/superdesk/superdesk.git
git fetch origin master
git checkout master

# Delete analytics and publisher from config
sed '/.*superdesk-analytics.*/d' client/package.json
sed -i 's/.*"superdesk-publisher": "superdesk/superdesk-publisher#master".*/"superdesk-planning": "superdesk/superdesk-planning#master"/' client/package.json

sed -i 's/superdesk.analytics/superdesk-planning/' client/superdesk.config.js
sed -i "s/'superdesk-analytics',/'superdesk-planning'/" client/superdesk.config.js
sed '/.*superdesk-publisher.*/d' client/superdesk.config.js
sed -i 's/analytics:/planning: true, assignments:/' client/superdesk.config.js

sed '/.*superdesk-analytics.*/d' server/requirements.txt
echo "-e ../../" >> server/requirements.txt

sed -i 's/analytics/planning/' server/settings.py
echo "SUPERDESK_TESTING = True" | sudo tee -a ./settings.py
echo "DEBUG = True" | sudo tee -a ./settings.py


cd client
npm --python=python2.7 install
npm --python=python2.7 link ../../

cd ../server
pip install -r requirements.txt
cd ../../
pip install -e .

export DISPLAY=:99.0 && /sbin/start-stop-daemon --start --quiet --pidfile /tmp/custom_xvfb_99.pid --make-pidfile --background --exec /usr/bin/Xvfb -- :99 -ac -screen 0 1920x1080x24
export CHROME_BIN=`which google-chrome` && $CHROME_BIN --version ;

pwd
ls -la
ls -la $E2E_DIR
ls -la $PLANNING_DIR
sudo sed -i 's\enabled: true\enabled: false\' /etc/mongod.conf
sudo service mongod restart

sudo service elasticsearch restart
sleep 15

cd $E2E_DIR/client/dist
nohup python -m http.server 9000 &
cd $E2E_DIR/server


honcho start &
sleep 15
cd $PLANNING_DIR
./node_modules/.bin/webdriver-manager update --gecko=false
./node_modules/protractor/bin/protractor protractor.conf.js --stackTrace --verbose
