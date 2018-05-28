#!/bin/bash -e
BACKEND_DIR=server
VENV=`pwd`/$BACKEND_DIR/env/bin/activate
PLANNING_DIR=`pwd`
E2E_DIR=`pwd`/e2e
SCRIPTS_DIR=`pwd`/scripts
mkdir $E2E_DIR && cd $E2E_DIR

git init
git remote add origin https://github.com/superdesk/superdesk.git
git fetch origin master
git checkout master

# Delete analytics and publisher from config
cp -f $SCRIPTS_DIR/package.json client/package.json
cp -f $SCRIPTS_DIR/superdesk.config.js client/superdesk.config.js

cp -f $SCRIPTS_DIR/requirements.txt server/requirements.txt
cp -f $SCRIPTS_DIR/settings.py server/settings.py

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
