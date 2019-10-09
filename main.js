const AWS = require('aws-sdk');

AWS.config.update({region: 'us-west-2'});

const lookupPrefix = "ip-";
const lookupContains = "compute.internal";
const getCredentialsUrl = "http://169.254.169.254/latest/meta-data/iam/security-credentials/hologram-access"; // assume hologram because ;)

var tabRegistry = {};

// Get all existing tabs
chrome.tabs.query({}, function(results) {
    results.forEach(function(tab) {
        tabRegistry[tab.id] = tab;
    });
});

// Create tab event listeners
function onUpdatedListener(tabId, changeInfo, tab) {
    tabRegistry[tab.id] = tab;
}
function onRemovedListener(tabId) {
    delete tabRegistry[tabId];
}

// Subscribe to tab events
chrome.tabs.onUpdated.addListener(onUpdatedListener);
chrome.tabs.onRemoved.addListener(onRemovedListener);

function setupCredentials() {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", getCredentialsUrl, false);
    xhr.send();
    var result = JSON.parse(xhr.responseText);
    const resultCredentials = {
        accessKeyId: result.AccessKeyId,
        secretAccessKey: result.SecretAccessKey,
        sessionToken: result.Token
    };
    AWS.config.update(resultCredentials);
}

function getPublicDnsNameForInstance(privateDnsName) {
    return new Promise((resolve, reject) => {
        setupCredentials();
        var ec2 = new AWS.EC2({apiVersion: '2016-11-15'});
        var params = {
            Filters: [
                {
                    Name: "private-dns-name",
                    Values: [
                        privateDnsName
                    ]
                }
            ]
        };
        ec2.describeInstances(params, function (error, data) {
            if (error) {
                reject(error);
            } else {
                resolve(data.Reservations[0].Instances[0].PublicDnsName);
            }
        });
    });
}


chrome.webRequest.onBeforeRequest.addListener(
    function(details) {
        var parsedUrl = new URL(details.url);
        var hostName = parsedUrl.hostname;
        if (hostName.startsWith(lookupPrefix) && hostName.includes(lookupContains)) {
            console.log("Matched " + JSON.stringify(details));
            getPublicDnsNameForInstance(hostName).then(
                (newHost) => {
                    var newUrl = parsedUrl.protocol + "//" + newHost + ":" + parsedUrl.port + parsedUrl.pathname;
                    chrome.tabs.update(details.tabId, {url: newUrl});
                }
            );
        }
    },
    {urls: ["<all_urls>"]}
);
