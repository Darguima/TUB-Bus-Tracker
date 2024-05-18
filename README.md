# TUB Bus Tracker

Simple Web App to track TUB buses in real-time, using their scraped API. 

See the [demo](#demo) 🎥 down below.

## What's TUB?

[TUB](https://tub.pt/) (`Transportes Urbanos de Braga`) is the public Bus company of Braga, Portugal.

## The history

At the start of 2024, TUB launched a new App where is available the feature of track buses in real-time, however, just one route once. 

The idea here was to join all the routes in one map at once to track all the buses at the same time and on the same map.

## How?

Well, with [HTTPToolkit](https://httptoolkit.com/), [F-Droid](https://f-droid.org/), [Aurora Store](https://www.auroraoss.com/) and an Android Emulator I passed all the App traffic over a proxy, found out the API endpoints and now I can just use them. Simple! :)

All this workaround is needed because Android don't allow proxy the traffic from Apps when the PlayStore is available on the system.

The endpoints scraped are:

| Endpoint                                                       | Description                                         |
|----------------------------------------------------------------|-----------------------------------------------------|
| https://mobibus-gateway.ndrive.com/busLocation/${route number} | Returns the location of all the buses on this route |

## Demo

Just watch!

https://github.com/Darguima/FindYourFriendUniversity/assets/49988070/0fe20807-7e11-431b-ae6f-7cd78b0dbf85

## Deploy

Just clone and serve the files. For example:

```bash
$ git clone git clone git@github.com:Darguima/TUB-Bus-Tracker.git
$ python3 -m http.server
```

And now access `localhost:8000`.
