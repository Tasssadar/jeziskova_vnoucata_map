"use strict";

var gMap = null;
var gData = null;
var gMarkerLayers = [];

var GREEN_ICON = new L.Icon({
    iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});


function renderMarkers() {
    for(var i = 0; i < gMarkerLayers.length; ++i) {
        gMap.removeLayer(gMarkerLayers[i]);
    }
    gMarkerLayers = [];
    renderToMap();
}

function formatWish(wish) {
    var res = "";
    res += "<div><b>" + wish.name + "</b>";
    if(wish.age)
        res += ", " + wish.age + " let";
    res += "<b style=\"float: right\">" + wish.place + "</b></div>";

    res += "<h4>" + wish.thing + "</h4>";
    if(wish.price)
        res += "<div>" + wish.price[0] +" až " + wish.price[1] + " Kč</div>";
    res += "<p>" + wish.text + "</p>";
    res += '<a href="https://jeziskovavnoucata.rozhlas.cz/prani/venovat/' + wish.id + '" target="blank_">CHCI VĚNOVAT...</a>';
    return res;
}

function renderToMap() {
    var cbDarky = document.getElementById("cbDarky");
    var cbZazitky = document.getElementById("cbZazitky");

    for(var i = 0; i < gData.places.length; ++i) {
        var place = gData.places[i];
        var markers = L.markerClusterGroup();
        for(var x = 0; x < place.wishes.length; ++x) {
            var wish = place.wishes[x];
            var extra = { };
            if(wish.typ === "zážitek") {
                if(!cbZazitky.checked)
                    continue
                extra["icon"] = GREEN_ICON;
            } else if(!cbDarky.checked)
                continue;

            var marker = L.marker(place.coords, extra);
            marker.bindPopup(formatWish(wish));
            markers.addLayer(marker);
        }
        gMap.addLayer(markers);
        gMarkerLayers.push(markers);
    }
}

function onDataLoad(req) {
    gData = JSON.parse(req.responseText);

    var wishCount = 0;
    for(var i = 0; i < gData.places.length; ++i) {
        wishCount += gData.places[i].wishes.length;
    }

    var gen = document.getElementById("generatedon");
    gen.innerText = "Poslední aktualizace " + new Date(gData.timestamp*1000).toLocaleString() + ", " +
        gData.places.length + " míst, " + wishCount + " přání.";


    renderMarkers();
}

(function() {
    L.Map = L.Map.extend({
        openPopup: function(popup) {
            //        this.closePopup();  // just comment this
            this._popup = popup;
            return this.addLayer(popup).fire('popupopen', {
                popup: this._popup
            });
        }
    });

    gMap = L.map('map').setView([49.7437572, 15.3386383], 8);

    L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
        attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
        maxZoom: 18,
        id: 'mapbox.streets',
        accessToken: 'pk.eyJ1IjoidGFzc2FkYXIiLCJhIjoiY2szMjB6bHhmMGJ3ajNscDlwbmMxamd1ZyJ9.9Kf65AGosFjB7zaWLIJywg'
    }).addTo(gMap);

    var req = new XMLHttpRequest();
    req.open("GET", "data.json");
    req.onload = onDataLoad.bind(this, req);
    req.send(); 
})();
