#!/bin/bash

set -e

###############################################
# Script variables
INTEGRATIONS_BRANCH=${INTEGRATIONS_BRANCH:-legacy}
ROUTER_BRANCH=${INTEGRATIONS_BRANCH:-main}
ANVIL_URL=${ANVIL_URL:-http://127.0.0.1:8545}
DEBUG=${DEBUG:-false}
###############################################
if [[ "${DEBUG}" == "true" ]]; then 
  set -x
  FORGE_TEST_FLAGS="-vvvv"; 
else
  FORGE_BUILD_FLAGS="--silent"; 
  YARN_FLAGS="--silent"; 
  GIT_FLAGS="--quiet"
fi


TEMP_DIR=$(mktemp -d)
# check if tmp dir was created
if [[ ! "${TEMP_DIR}" || ! -d "${TEMP_DIR}" ]]; then
  echo "Could not create temp dir"
  exit 1
else
  echo "Created temp dir ${TEMP_DIR}"
fi

# removes temp directory on exit
function cleanup {      
  rm -rf ${TEMP_DIR}
  echo "Deleted temp dir ${TEMP_DIR}"
}
trap cleanup EXIT

###############################################
# Tesing integrations-v3
###############################################
cd ${TEMP_DIR}
git clone --branch ${INTEGRATIONS_BRANCH} --single-branch ${GIT_FLAGS} https://github.com/Gearbox-protocol/integrations-v3.git 
cd ${TEMP_DIR}/integrations-v3
yarn install --frozen-lockfile ${YARN_FLAGS}
forge build ${FORGE_BUILD_FLAGS}
# TODO: wstETH is temporary removed
for u in DAI_0 USDC_0 WETH_0 WETH_1 WBTC_0 FRAX_0 ;
do
  export ETH_FORK_TESTED_CM_ASSET=${u%_*}
  export ETH_FORK_TESTED_CM_INDEX=${u#*_}
  echo "Running integrations-v3 tests for ${ETH_FORK_TESTED_CM_ASSET} index ${ETH_FORK_TESTED_CM_INDEX}"
  forge t ${FORGE_TEST_FLAGS} --match-test _live_ --chain-id 1337 --fork-url ${ANVIL_URL} || true
done
###############################################
# Tesing router
###############################################
cd ${TEMP_DIR}
git clone --branch ${ROUTER_BRANCH} --single-branch ${GIT_FLAGS} https://github.com/Gearbox-protocol/router.git
cd ${TEMP_DIR}/router
yarn install --frozen-lockfile ${YARN_FLAGS} 
forge build ${FORGE_BUILD_FLAGS}
# TODO: wstETH is temporary removed
for u in DAI_0 USDC_0 WETH_0 WETH_1 WBTC_0 FRAX_0 ;
do
  export ETH_FORK_USE_EXISTING=true
  export ETH_FORK_USE_EXISTING_PATHFINDER=true
  export ETH_FORK_TESTED_CM_ASSET=${u%_*}
  export ETH_FORK_TESTED_CM_INDEX=${u#*_}
  echo "Running router tests for ${ETH_FORK_TESTED_CM_ASSET} index ${ETH_FORK_TESTED_CM_INDEX}"
  forge t ${FORGE_TEST_FLAGS} --match-test _live_ --chain-id 1337 --fork-url ${ANVIL_URL} || true
done
