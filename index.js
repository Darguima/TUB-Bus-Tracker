DEBUG = true

var map = L.map('map').setView([41.55, -8.42], 14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

const map_state = {
  configs: {
    selectedRoute: undefined,
    refreshRate: 60
  },

  iconScale: 2,

  routes: [],
  userMarker: undefined,

  userLocation: {
    permissionsRequested: false,
    permissionsGranted: false,
    alreadyDrawing: false
  },
}

const busIcon = L.icon({
  iconUrl: './busLocation.svg',
  iconSize: [20 * map_state.iconScale, 16 * map_state.iconScale],
  iconAnchor: [8 * map_state.iconScale, 20 * map_state.iconScale]
});

const addEvents = (routesNumbers) => {
  const configs = map_state.configs

  // Route Picker
  const selectRouteElem = document.getElementById("routesPicker");
  routesNumbers.forEach(routeNumber => {
    const option = document.createElement("option");
    option.text = `Route ${routeNumber}`;
    option.value = routeNumber;
    selectRouteElem.add(option);
  })

  selectRouteElem.addEventListener("change", async (event) => {
    const selectedRoute = event.target.value;
    configs.selectedRoute = selectedRoute == "all" ? undefined : selectedRoute;
  })

  // Refresh Rate input
  const refreshRateElem = document.getElementById("refreshRate");
  refreshRateElem.value = configs.refreshRate;
  refreshRateElem.addEventListener("change", async (event) => {
    if (event.target.value < 1) configs.refreshRate = 60;
    else if (event.target.value > 600) configs.refreshRate = 600;
    else configs.refreshRate = event.target.value

    refreshRateElem.value = configs.refreshRate;
  })

  // Center User Location Button
  const centerUserLocationButton = document.getElementById("centerUserLocation");
  centerUserLocationButton.addEventListener("click", async () => {
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

    const routesInfo = await (await fetch(`https://mobibus-gateway.ndrive.com/busLocation/${route.routeNumber}`, {
      method: 'GET',
      headers: {
        'apikey': 'XfBl068e3CQLECHKTwuzH0IYG6q4AMQaxwghm7clCJi036Y/xNxHKA=='
      }
    })).json()

    const buses = {};

    routesInfo.forEach(busInfo => {
      const bus = {
        lat: busInfo.lat,
        lon: busInfo.lon
      }

      var marker;
      if (route.buses[busInfo.busId] != undefined) {
        marker = route.buses[busInfo.busId].marker
      } else {
        marker = L.marker([bus.lat, bus.lon], { icon: busIcon });

        marker.bindTooltip(`Bus ${route.routeNumber}`, {
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

      map_state.routes = newRoutes
    })
}

const drawUser = async () => {
  if (map_state.userLocation.permissionsRequested && map_state.userLocation.alreadyDrawing && !map_state.userLocation.alreadyDrawing) {
    setTimeout(drawUser, 500)
    return
  }

  map_state.userLocation.permissionsRequested = true
  map_state.userLocation.alreadyDrawing = true

  navigator.geolocation.getCurrentPosition((position) => {
    map_state.userLocation.permissionsGranted = true

    if (DEBUG) {
      console.log(position)
    }

    if (!map_state.userMarker) {
      map_state.userMarker = L.circleMarker([position.coords.latitude, position.coords.longitude]);
      map_state.userMarker.addTo(map);
    }

    map_state.userMarker.setLatLng(new L.LatLng(position.coords.latitude, position.coords.longitude));

    map_state.userLocation.alreadyDrawing = false
  })

  setTimeout(drawUser, 2000)
}

const main = async (routesNumbers) => {
  const routes = map_state.routes

  routesNumbers.forEach(routeNumber => {
    routes.push({
      routeNumber: routeNumber,
      buses: {}
    })
  })

  addEvents(routesNumbers)

  drawUser()

  while (true) {
    await drawBuses();

    await new Promise(r => setTimeout(r, (60 / map_state.configs.refreshRate) * 1000));
  }
}

fetch("./routes.json")
  .then(response => response.json())
  .then(data => {
    main(Object.keys(data))
  });

