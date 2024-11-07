DEBUG = false
BUS_UPDATES_PER_MINUTE = 60

var map = L.map('map').setView([41.55, -8.42], 14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

const map_state = {
  configs: {
    selectedRoute: undefined,
  },

  iconScale: 2,
  lastUpdateTimestamp: new Date(),

  routes: [],
  userMarker: undefined,

  userLocation: {
    permissionsRequested: false,
    permissionsGranted: false
  },

  domComponents: {
    routesPickerSelectElem: document.getElementById("routesPickerSelect"),
    centerUserLocationElem: document.getElementById("centerUserLocation"),
    lastUpdateInfoElem: document.getElementById("lastUpdateInfo")
  }
}

const busIcon = L.icon({
  iconUrl: './busLocation.svg',
  iconSize: [20 * map_state.iconScale, 16 * map_state.iconScale],
  iconAnchor: [8 * map_state.iconScale, 20 * map_state.iconScale]
});

const fetchRoutesInfo = async () => {
  return fetch("./routes.json")
    .then(response => response.json())
    .then(routesInfo => {
      return Object.values(routesInfo).map(route => {
        const routesNames = route[1].split(" - ").map(name => name.trim())

        return {
          routeNumber: route[0],
          inBoundRouteName: routesNames[0],
          outBoundRouteName: routesNames[1] || routesNames[0],
          buses: {}
        }
      })
    })
}

const addEvents = () => {
  const configs = map_state.configs
  const routesNumbers = map_state.routes.map(route => route.routeNumber)

  const { routesPickerSelectElem, centerUserLocationElem } = map_state.domComponents

  // Route Picker
  routesNumbers.forEach(routeNumber => {
    const option = document.createElement("option");
    option.text = `Route ${routeNumber}`;
    option.value = routeNumber;
    routesPickerSelectElem.add(option);
  })

  routesPickerSelectElem.addEventListener("change", async (event) => {
    const selectedRoute = event.target.value;
    configs.selectedRoute = selectedRoute == "all" ? undefined : selectedRoute;
  })

  // Center User Location Button
  centerUserLocationElem.addEventListener("click", async () => {
    navigator.geolocation.getCurrentPosition((position) => {
      map.setView([position.coords.latitude, position.coords.longitude], 15);
    })
  })
}

const drawBuses = async () => {
  const routes = map_state.routes
  const configs = map_state.configs

  const newRoutes = routes.map(async route => {
    if (configs.selectedRoute != undefined && configs.selectedRoute != route.routeNumber) {
      Object.keys(route.buses).forEach(busId => {
        map.removeLayer(route.buses[busId].marker)
      })

      return route
    }

    const busesOnRouteInfo = await (await fetch(`https://mobibus-gateway.ndrive.com/busLocation/${route.routeNumber}`, {
      method: 'GET',
      headers: {
        'apikey': 'XfBl068e3CQLECHKTwuzH0IYG6q4AMQaxwghm7clCJi036Y/xNxHKA=='
      }
    })).json()

    const buses = {};

    busesOnRouteInfo.forEach(busInfo => {
      const bus = {
        lat: busInfo.lat,
        lon: busInfo.lon,
        direction: busInfo.direction
      }

      var marker;
      if (route.buses[busInfo.busId] != undefined) {
        marker = route.buses[busInfo.busId].marker
      } else {
        marker = L.marker([bus.lat, bus.lon], { icon: busIcon });

        const destination = bus.direction == 1 ? route.outBoundRouteName : route.inBoundRouteName

        marker.bindTooltip(`${route.routeNumber} - ${destination}`, {
          permanent: false,
          direction: "bottom"
        });
      }

      marker.setLatLng([bus.lat, bus.lon])
      bus.marker = marker

      marker.addTo(map);
      buses[busInfo.busId] = bus
    })

    // Clear from the map buses that are no longer in the route
    const newBusesIds = Object.keys(buses);
    Object.keys(route.buses).forEach(oldBusId => {
      if (!newBusesIds.includes(oldBusId)) {
        map.removeLayer(route.buses[oldBusId].marker)
      }
    })

    route.buses = buses

    return route
  })

  return Promise.all(newRoutes)
    .then((newRoutes) => {
      if (DEBUG) {
        console.log(newRoutes)
      }

      map_state.lastUpdateTimestamp = new Date()

      map_state.routes = newRoutes
    })
}

const drawUser = async () => {
  if (map_state.userLocation.permissionsRequested && !map_state.userLocation.permissionsGranted) {
    return
  }

  map_state.userLocation.permissionsRequested = true

  navigator.geolocation.getCurrentPosition(
    (position) => {
      map_state.userLocation.permissionsGranted = true

      if (DEBUG) {
        console.log(position)
      }

      if (!map_state.userMarker) {
        map_state.userMarker = L.circleMarker([position.coords.latitude, position.coords.longitude]);
        map_state.userMarker.addTo(map);
      }

      map_state.userMarker.setLatLng(new L.LatLng(position.coords.latitude, position.coords.longitude));

      setTimeout(drawUser, 2000)
    },
    (error) => {
      if (error != "User denied Geolocation") {
        map_state.userLocation.permissionsGranted = false
      } else {
        map_state.userLocation.permissionsGranted = true
        setTimeout(drawUser, 2000)
      }
    }
  )
}

const updateLastUpdateInfo = () => {
  const { lastUpdateInfoElem } = map_state.domComponents

  const now = new Date();
  const diffInSeconds = Math.floor((now - map_state.lastUpdateTimestamp) / 1000);
  let timeString = `Last update ${diffInSeconds < 2 ? 0 : diffInSeconds} seconds ago`;

  if (diffInSeconds >= 60) {
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    let remainingSeconds = diffInSeconds % 60;
    timeString = `Last update ${diffInMinutes}:${remainingSeconds.toString().padStart(2, '0')} min ago`;
  }

  lastUpdateInfoElem.innerHTML = timeString;

  setTimeout(updateLastUpdateInfo, 1000);
}

const main = async () => {
  map_state.routes = await fetchRoutesInfo()

  addEvents()

  drawUser()

  updateLastUpdateInfo()

  while (true) {
    try {
      await drawBuses();
    } catch (_) { /* To avoid kill the function after a network drop */ }

    await new Promise(r => setTimeout(r, (60 / BUS_UPDATES_PER_MINUTE) * 1000));
  }
}

main()
