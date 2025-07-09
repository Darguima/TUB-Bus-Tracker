UPDATES_PER_SECOND = 1

var map = L.map('map').setView([41.55, -8.42], 14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

const mapState = {
  routes: Promise.resolve(undefined),
  routesMap: Promise.resolve(undefined),

  lastUpdateTimestamp: new Date(),

  busIconScale: 2,

  pickerSelectedRoute: undefined,
  selectedBusNumber: undefined,

  userLocationMarkerLayer: undefined,
  helpingRouteLayer: undefined,

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

const inboundBusLocation = L.icon({
  iconUrl: './assets/inboundBusLocation.svg',
  iconSize: [20 * mapState.busIconScale, 16 * mapState.busIconScale],
  iconAnchor: [8 * mapState.busIconScale, 20 * mapState.busIconScale]
});

const outboundBusLocation = L.icon({
  iconUrl: './assets/outboundBusLocation.svg',
  iconSize: [20 * mapState.busIconScale, 16 * mapState.busIconScale],
  iconAnchor: [8 * mapState.busIconScale, 20 * mapState.busIconScale]
});

const fetchRoutesInfo = async () => {
  return fetch("./assets/routes.json")
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

const fetchRoutesMap = async () => {
  return fetch("./assets/routesMap.json")
    .then(response => response.json())
    .then(routesInfo => {

      const geoJsonMaps = routesInfo.features.reduce((geoJsonMaps, feature) => {
        const routeNumber = feature.properties?.Name?.split("_")[0];

        if (!geoJsonMaps[routeNumber]) {
          geoJsonMaps[routeNumber] = {
            type: "FeatureCollection",
            features: []
          };
        }

        geoJsonMaps[routeNumber].features.push(feature);
        return geoJsonMaps;
      }, {})

      const layersMap = Object.keys(geoJsonMaps).reduce((layersMap, routeNumber) => {

        layersMap[routeNumber] = L.geoJSON(geoJsonMaps[routeNumber], {
          style: function (feature) {
            const styleUrl = feature.properties?.styleUrl || '';
            let color = '#0000ff'; // default blue
            if (styleUrl.includes('red')) color = '#ff0000';
            return { color, weight: 3 };
          }
        });

        return layersMap;

      }, {})

      return layersMap;
    })
}

const prepareDOM = () => {
  const routesNumbers = mapState.routes.map(route => route.routeNumber);

  const { routesPickerSelectElem, centerUserLocationElem } = mapState.domComponents

  // Route Picker
  routesNumbers.forEach(routeNumber => {
    const option = document.createElement("option");
    option.text = `Route ${routeNumber}`;
    option.value = routeNumber;
    routesPickerSelectElem.add(option);
  })

  routesPickerSelectElem.addEventListener("change", async (event) => {
    const selectedRoute = event.target.value;
    mapState.pickerSelectedRoute = selectedRoute == "all" ? undefined : selectedRoute;
    mapState.selectedBusNumber = undefined;
    drawHelpingRoute();
  })

  // Center User Location Button
  centerUserLocationElem.addEventListener("click", async () => {
    navigator.geolocation.getCurrentPosition((position) => {
      map.setView([position.coords.latitude, position.coords.longitude], 15);
    })
  })
}

const drawUserLocation = async () => {
  if (mapState.userLocation.permissionsRequested && !mapState.userLocation.permissionsGranted) {
    return
  }

  mapState.userLocation.permissionsRequested = true

  navigator.geolocation.getCurrentPosition(
    (position) => {
      mapState.userLocation.permissionsGranted = true

      if (!mapState.userLocationMarkerLayer) {
        mapState.userLocationMarkerLayer = L.circleMarker([position.coords.latitude, position.coords.longitude]);
        mapState.userLocationMarkerLayer.addTo(map);
      }

      mapState.userLocationMarkerLayer.setLatLng(new L.LatLng(position.coords.latitude, position.coords.longitude));

      setTimeout(drawUserLocation, 2000)
    },
    (error) => {
      if (error != "User denied Geolocation") {
        mapState.userLocation.permissionsGranted = false
      } else {
        mapState.userLocation.permissionsGranted = true
        setTimeout(drawUserLocation, 2000)
      }
    }
  )
}

const drawBuses = async () => {
  const routes = mapState.routes

  const newRoutes = routes.map(async route => {
    if (mapState.pickerSelectedRoute != undefined && mapState.pickerSelectedRoute != route.routeNumber) {
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
        marker = L.marker([bus.lat, bus.lon], { icon: bus.direction == 1 ? outboundBusLocation : inboundBusLocation });

        const destination = bus.direction == 1 ? route.outBoundRouteName : route.inBoundRouteName

        marker.bindTooltip(`${route.routeNumber} - ${destination}`, {
          permanent: false,
          direction: "bottom"
        });

        marker.on('click', _ => {
          if (mapState.selectedBusNumber === busInfo.busId) {
            mapState.selectedBusNumber = undefined;
            drawHelpingRoute();
          } else {
            mapState.selectedBusNumber = busInfo.busId;
            drawHelpingRoute(route.routeNumber);
          }

        });
      }

      marker.setOpacity(1.0);
      if (mapState.selectedBusNumber && mapState.selectedBusNumber !== busInfo.busId) {
        marker.setOpacity(0.3);
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
      mapState.lastUpdateTimestamp = new Date()

      mapState.routes = newRoutes
    })
}

const drawHelpingRoute = async (routeNumber) => {
  const routeToDraw = mapState.pickerSelectedRoute || routeNumber;

  if (mapState.helpingRouteLayer) {
    map.removeLayer(mapState.helpingRouteLayer);
    mapState.helpingRouteLayer = undefined;
  }

  const routesMap = (await mapState.routesMap);

  if (routeToDraw && routesMap) {
    mapState.helpingRouteLayer = routesMap[routeToDraw];
    mapState.helpingRouteLayer?.addTo(map);
  }
}

const updateLastUpdateInfo = () => {
  const { lastUpdateInfoElem } = mapState.domComponents

  const now = new Date();
  const diffInSeconds = Math.floor((now - mapState.lastUpdateTimestamp) / 1000);
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

  drawUserLocation()

  mapState.routes = await fetchRoutesInfo()
  mapState.routesMap = fetchRoutesMap()

  prepareDOM()


  updateLastUpdateInfo()

  while (true) {
    try {
      await drawBuses();
    } catch (_) { /* To avoid kill the function after a network drop */ }

    await new Promise(r => setTimeout(r, UPDATES_PER_SECOND * 1000));
  }
}

main()
