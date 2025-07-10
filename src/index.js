UPDATES_PER_SECOND = 1

var map = L.map('map').setView([41.55, -8.42], 14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

/**
 * @typedef {Object} RouteInfo
 * @property {string} routeNumber
 * @property {string} inBoundRouteName
 * @property {string} outBoundRouteName
 */

/**
 * @typedef {Object} BusesLocations
 * @property {string} busId
 * @property {number} lat
 * @property {number} lon
 * @property {number} direction
 */

/**
 * @typedef {Object} Route
 * @property {int} routeNumber
 * @property {RouteInfo} routeInfo
 * @property {Promise<L.GeoJSON>} routeMap
 * @property {BusesLocations} busesLocations
 * @property {{ [busId: string]: L.Marker }} busesMarkers
 */

/** * @typedef {Object} MapState
 * @property {{ [routeId: string]: Route }} routes
 * @property {Date} lastUpdateTimestamp
 * @property {number} busIconScale
 * @property {string | undefined} pickerSelectedRoute
 * @property {string | undefined} selectedBusNumber
 * @property {L.Layer | undefined} userLocationMarkerLayer
 * @property {L.Layer | undefined} helpingRouteLayer
 * @property {{ permissionsRequested: boolean, permissionsGranted: boolean }} userLocation
 * @property {{ routesPickerSelectElem: HTMLSelectElement, centerUserLocationElem: HTMLButtonElement, lastUpdateInfoElem: HTMLElement }} domComponents
 */

/** @type {MapState} */
const mapState = {
  routes: {},

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
    .then(routesInfo => (
      Object.values(routesInfo).forEach(route => {
        const routesNames = route[1].split(" - ").map(name => name.trim())

        mapState.routes[route[0]] = {
          routeNumber: route[0],
          routeInfo: {
            routeNumber: route[0],
            inBoundRouteName: routesNames[0],
            outBoundRouteName: routesNames[1] || routesNames[0],
          },
          routeMap: undefined,
          busesMarkers: {},
        }
      })
    ))
}

const fetchRoutesMap = () => {
  const routesMap = fetch("./assets/routesMap.json")
    .then(response => response.json())
    .then(routesGeoJSON => {

      // Group map traces by route Number
      const groupedRoutes = {};

      Object.keys(routesGeoJSON.features).forEach(featureId => {
        const feature = routesGeoJSON.features[featureId];
        const routeNumber = feature.properties?.Name?.split("_")[0];

        groupedRoutes[routeNumber] = groupedRoutes[routeNumber] || {
          type: "FeatureCollection",
          features: []
        }

        groupedRoutes[routeNumber].features.push(feature);
      })

      return groupedRoutes
    })

  // Add a promise of the Layer to each route in the mapState
  Object.keys(mapState.routes).forEach(routeNumber => {
    mapState.routes[routeNumber].routeMap = routesMap.then(routesMap => {
      const routeMap = routesMap[routeNumber];

      return L.geoJSON(routeMap, {
        style: { color: '#9B59B6', weight: 2 }
      })
    })
  })
}

const fetchBusesLocation = async () => {
  return Promise.all(Object.keys(mapState.routes).map(async routeNumber => {
    if (mapState.pickerSelectedRoute != undefined && mapState.pickerSelectedRoute != routeNumber) {
      mapState.routes[routeNumber].busesLocations = {};
      return
    }

    const busesOnRouteInfo = await (await fetch(`https://mobibus-gateway.ndrive.com/busLocation/${routeNumber}`, {
      method: 'GET',
      headers: {
        'apikey': 'XfBl068e3CQLECHKTwuzH0IYG6q4AMQaxwghm7clCJi036Y/xNxHKA=='
      }
    })).json()

    const buses = {};

    busesOnRouteInfo.forEach(busInfo => {
      buses[busInfo.busId] = {
        lat: busInfo.lat,
        lon: busInfo.lon,
        direction: busInfo.direction,
        busId: busInfo.busId
      }
    })

    mapState.routes[routeNumber].busesLocations = buses

    drawBus(routeNumber)

    return
  }))
}

const prepareDOM = () => {
  const routesNumbers = Object.keys(mapState.routes);

  const { routesPickerSelectElem, centerUserLocationElem } = mapState.domComponents

  // Route Picker
  routesNumbers.forEach(routeNumber => {
    const option = document.createElement("option");
    option.text = `Route ${routeNumber}`;
    option.label = `Route ${routeNumber}`;
    option.value = routeNumber;
    routesPickerSelectElem.add(option);
  })

  routesPickerSelectElem.addEventListener("change", async (event) => {
    const selectedRoute = event.target.value;
    mapState.pickerSelectedRoute = selectedRoute == "all" ? undefined : selectedRoute;
    mapState.selectedBusNumber = undefined;
    drawBuses();
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

const drawBus = (routeNumber) => {
  const route = mapState.routes[routeNumber];
  const routeInfo = route.routeInfo;

  // Clear from the map buses that are no longer in the route
  const newBusesIds = Object.keys(route.busesLocations);
  Object.keys(route.busesMarkers).forEach(oldBusId => {
    if (!newBusesIds.includes(oldBusId)) {
      map.removeLayer(route.busesMarkers[oldBusId])
    }
  })

  // Hide all other buses if a route is selected in the picker
  if (mapState.pickerSelectedRoute && mapState.pickerSelectedRoute !== routeNumber) {
    Object.keys(route.busesMarkers).forEach(hiddenBus => {
      map.removeLayer(route.busesMarkers[hiddenBus])
    })
    return;
  }

  // Create/edit markers for each bus in the route
  Object.keys(route.busesLocations).forEach(busId => {
    const bus = route.busesLocations[busId];

    var marker;
    if (route.busesMarkers[busId] != undefined) {
      marker = route.busesMarkers[busId]
    } else {
      marker = L.marker([bus.lat, bus.lon], { icon: bus.direction === 1 ? outboundBusLocation : inboundBusLocation });

      const destination = bus.direction === 1 ? routeInfo.outBoundRouteName : routeInfo.inBoundRouteName

      marker.bindTooltip(`${routeNumber} - ${destination}`, {
        permanent: false,
        direction: "bottom"
      });

      marker.on('click', _ => {
        if (mapState.selectedBusNumber === busId) {
          mapState.selectedBusNumber = undefined;
          drawBuses();
          drawHelpingRoute();
        } else {
          mapState.selectedBusNumber = busId;
          drawBuses()
          drawHelpingRoute(routeNumber);
        }
      });

      route.busesMarkers[busId] = marker;
    }

    marker.setOpacity(1.0);
    if (mapState.selectedBusNumber && mapState.selectedBusNumber !== busId) {
      marker.setOpacity(0.3);
    }

    marker.setLatLng([bus.lat, bus.lon])
    marker.addTo(map);
  })
}

const drawBuses = () => {
  Object.keys(mapState.routes).forEach(drawBus)
}

const drawHelpingRoute = async (routeNumber) => {
  const routeToDraw = mapState.pickerSelectedRoute || routeNumber;

  if (mapState.helpingRouteLayer) {
    map.removeLayer(mapState.helpingRouteLayer);
    mapState.helpingRouteLayer = undefined;
  }

  const routeMap = await mapState.routes[routeToDraw]?.routeMap;

  if (routeToDraw && routeMap) {
    mapState.helpingRouteLayer = routeMap;
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

  await fetchRoutesInfo()
  fetchRoutesMap()

  prepareDOM()

  updateLastUpdateInfo()

  while (true) {
    try {
      await fetchBusesLocation();
      mapState.lastUpdateTimestamp = new Date()
    } catch (_) { /* To avoid kill the function after a network drop */ }

    await new Promise(r => setTimeout(r, 1 / UPDATES_PER_SECOND * 1000));
  }
}

main()
