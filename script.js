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

function getWishLink(w) {
    var res = "https://jeziskovavnoucata.rozhlas.cz/prani/";
    res += (w.typ === "zážitek" ? "zazitek/?type=3" : "darek/?type=2");
    res += "&town=" + encodeURIComponent(w.place);
    res += "&fulltext=" + encodeURIComponent(w.thing);
    return res;
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
    res += '<a href="' + getWishLink(wish) + '" target="blank_" class="pure-button pure-button-primary" style="font-size: 130%;">Najít na vnoučatech</a>';
    return res;
}

function getFiltersObject() {
    var res = {
        darky: document.getElementById("darky").checked,
        zazitky: document.getElementById("zazitky").checked,
        thingOp: document.getElementById("thingOp").value,
        thing: document.getElementById("thing").value.trim().toLocaleLowerCase(),
        price: parseInt(document.getElementById("price").value, 10),
    };
    var nodes = [];
    for (var k in res) {
        if (res.hasOwnProperty(k)) {
            nodes.push(k + "=" + encodeURIComponent(res[k]));
        }
    }
    res["query"] = nodes.join("&");
    return res;
}

function setFiltersFromLocation() {
    var search = window.location.search;
    if(!search.startsWith("?") || window.location.search.length < 2)
        return;
    var params = search.substring(1).split("&");
    for(var i = 0; i < params.length; ++i) {
        var p = params[i];
        var idx = p.indexOf("=")
        if(idx === -1)
            continue;
        var name = p.substring(0, idx);
        var value = p.substring(idx+1);
        switch(name) {
            case "darky":
            case "zazitky":
                document.getElementById(name).checked = (value == "true");
                break;
            default:
                document.getElementById(name).value = value;
                break;
        }
    }
}

function renderToMap() {
    var filters = getFiltersObject();
    history.replaceState(null, "", "?" + filters.query);

    var wishCountTotal = 0;
    var wishCountDisplayed = 0;
    for(var i = 0; i < gData.places.length; ++i) {
        var place = gData.places[i];
        var markers = L.markerClusterGroup();
        wishCountTotal += place.wishes.length;
        for(var x = 0; x < place.wishes.length; ++x) {
            var wish = place.wishes[x];

            if(filters.thing.length !== 0) {
                var contains = wish.thing.toLocaleLowerCase().indexOf(filters.thing) !== -1;
                if((filters.thingOp == "0") !== contains)
                    continue;
            }

            if(filters.price !== -1 && (!wish.price || wish.price[0] !== filters.price)) {
                continue;
            }

            var extra = { };
            if(wish.typ === "zážitek") {
                if(!filters.zazitky)
                    continue
                extra["icon"] = GREEN_ICON;
            } else if(!filters.darky)
                continue;

            var marker = L.marker(place.coords, extra);
            marker.bindPopup(formatWish(wish));
            markers.addLayer(marker);
            ++wishCountDisplayed;
        }
        gMap.addLayer(markers);
        gMarkerLayers.push(markers);
    }

    var gen = document.getElementById("generatedon");
    gen.innerHTML = new Date(gData.timestamp*1000).toLocaleString() + ", " +
        gData.places.length + " míst, <b>" + wishCountDisplayed + "</b>/" + wishCountTotal + " přání.";
}

function onDataLoad(req) {
    gData = JSON.parse(req.responseText);
    renderMarkers();
}

(function() {
    setFiltersFromLocation();

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
        attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, ' +
            '<a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>' +
            ' | Přání &copy; <a href="https://jeziskovavnoucata.rozhlas.cz/">jeziskovavnoucata.rozhlas.cz</a>',
        maxZoom: 18,
        id: 'mapbox.streets',
        accessToken: 'pk.eyJ1IjoidGFzc2FkYXIiLCJhIjoiY2szMjB6bHhmMGJ3ajNscDlwbmMxamd1ZyJ9.9Kf65AGosFjB7zaWLIJywg'
    }).addTo(gMap);

    var req = new XMLHttpRequest();
    req.open("GET", "data.json");
    req.onload = onDataLoad.bind(this, req);
    req.send(); 
})();
