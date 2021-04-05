'use strict';

const { ipcRenderer } = require("electron");
const fetch = require('node-fetch');

const win = window
exports.authenticate = async function authenticate(popup) {

    //Get the code
    let code = await new Promise((resolve) => {
        ipcRenderer.send("microsoftLoginStart")

        ipcRenderer.on("microsoftLoginFinished", (event, arg) => {
            resolve(arg)
        })
    });

    if (code == "cancel") {
        throw new Error("UserCancelled")
    }

    // Get tokens
    let oauth2 = await fetch("https://login.live.com/oauth20_token.srf", {
        method: "POST",
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `client_id=00000000402b5328&code=${code}&grant_type=authorization_code&redirect_uri=https://login.live.com/oauth20_desktop.srf&scope=service::user.auth.xboxlive.com::MBI_SSL`
    }).then(res => res.json());

    let refresh_date = new Date().getTime() + oauth2.expires_in * 1000;

    let xbl = await fetch("https://user.auth.xboxlive.com/user/authenticate", {
        method: "POST",
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            Properties: {
                AuthMethod: "RPS",
                SiteName: "user.auth.xboxlive.com",
                RpsTicket: oauth2.access_token
            },
            RelyingParty: "http://auth.xboxlive.com",
            TokenType: "JWT"
        })
    }).then(res => res.json());

    let xsts = await fetch("https://xsts.auth.xboxlive.com/xsts/authorize", {
        method: "POST",
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            Properties: {
                SandboxId: "RETAIL",
                UserTokens: [
                    xbl.Token
                ]
            },
            RelyingParty: "rp://api.minecraftservices.com/",
            TokenType: "JWT"
        })
    }).then(res => res.json());

    let uhs = xbl.DisplayClaims.xui[0].uhs;

    let mcLogin = await fetch("https://api.minecraftservices.com/authentication/login_with_xbox", {
        method: "POST",
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({ "identityToken": `XBL3.0 x=${uhs};${xsts.Token}` })
    }).then(res => res.json());

    //Check if the player have the game
    let hasGame = await fetch("https://api.minecraftservices.com/entitlements/mcstore", {
        method: "GET",
        headers: {
            'Authorization': `Bearer ${mcLogin.access_token}`
        }
    }).then(res => res.json());

    if (!hasGame.items.find(i => i.name == "product_minecraft" || i.name == "game_minecraft")) {
        throw new Error('NotPaidAccount')
    }

    //Get the profile
    let profile = await fetch("https://api.minecraftservices.com/minecraft/profile", {
        method: "GET",
        headers: {
            'Authorization': `Bearer ${mcLogin.access_token}`
        }
    }).then(res => res.json());

    return { username: profile.name, uuid: profile.id, email: profile.id, access_token: mcLogin.access_token, clientToken: oauth2.refresh_token, refresh_date: refresh_date };
}

exports.refresh = async function refresh(uuid, refresh_date, refresh_token) {

    if (new Date().getTime() < refresh_date) {
        let profile = await fetch("https://api.minecraftservices.com/minecraft/profile", {
            method: "GET",
            headers: {
                'Authorization': `Bearer ${refresh_token}`
            }
        }).then(res => res.json());

        return { username: profile.name, uuid: profile.id, email: profile.id, access_token: mcLogin.access_token, clientToken: refresh_token, refresh_date: refresh_date };
    }

    let oauth2 = await fetch("https://login.live.com/oauth20_token.srf", {
        method: "POST",
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `grant_type=refresh_token&client_id=00000000402b5328&scope=service::user.auth.xboxlive.com::MBI_SSL&refresh_token=${refresh_token}`
    }).then(res => res.json());

    let new_refresh_date = new Date().getTime() + oauth2.expires_in * 1000;

    let xbl = await fetch("https://user.auth.xboxlive.com/user/authenticate", {
        method: "POST",
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            Properties: {
                AuthMethod: "RPS",
                SiteName: "user.auth.xboxlive.com",
                RpsTicket: oauth2.access_token
            },
            RelyingParty: "http://auth.xboxlive.com",
            TokenType: "JWT"
        })
    }).then(res => res.json());

    let xsts = await fetch("https://xsts.auth.xboxlive.com/xsts/authorize", {
        method: "POST",
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            Properties: {
                SandboxId: "RETAIL",
                UserTokens: [
                    xbl.Token
                ]
            },
            RelyingParty: "rp://api.minecraftservices.com/",
            TokenType: "JWT"
        })
    }).then(res => res.json());

    let uhs = xbl.DisplayClaims.xui[0].uhs;

    let mcLogin = await fetch("https://api.minecraftservices.com/authentication/login_with_xbox", {
        method: "POST",
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({ "identityToken": `XBL3.0 x=${uhs};${xsts.Token}` })
    }).then(res => res.json());

    let profile = await fetch("https://api.minecraftservices.com/minecraft/profile", {
        method: "GET",
        headers: {
            'Authorization': `Bearer ${mcLogin.access_token}`
        }
    }).then(res => res.json());

    return { username: profile.name, uuid: profile.id, email: profile.id, access_token: mcLogin.access_token, clientToken: oauth2.refresh_token, refresh_date: new_refresh_date };
}
