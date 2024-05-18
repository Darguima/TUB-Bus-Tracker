var map = L.map('map').setView([41.55, -8.42], 14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

const iconScale = 2
const busIcon = L.icon({
  iconUrl: './busLocation.svg',
  iconSize: [20 * iconScale, 16 * iconScale],
  iconAnchor: [8 * iconScale, 20 * iconScale]
});

const updateMap = async (routes, configs) => {
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
    .then(() => {
      return routes
    })
}

const main = async (routesNumbers) => {
  var routes = []
  var configs = {
    refreshRate: 60
  }

  routesNumbers.forEach(routeNumber => {
    routes.push({
      routeNumber: routeNumber,
      buses: {}
    })
  })

  // Route Picker
  const selectRouteElem = document.getElementById("routesPicker");
  configs.selectedRoute = undefined
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

  while (true) {
    routes = await updateMap(routes, configs);

    console.log(routes)
    console.log(configs)

    await new Promise(r => setTimeout(r, (60 / configs.refreshRate) * 1000));
  }
}

fetch("./routes.json")
  .then(response => response.json())
  .then(data => {
    main(Object.keys(data))
  });

