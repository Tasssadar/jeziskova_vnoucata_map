"use strict";

function onStatsDataLoad(req) {
    var stats = JSON.parse(req.responseText);

    document.getElementById("generatedon").innerText = moment(stats.timestamp, "X").format("D. MMMM Y, H:mm")

    var wishCats = [
        {
            key: "completed",
            label: "Splněná přání",
            color: "#85b52d",
        },
        {
            key: "inprogress",
            label: "Přání, která se plní",
            color: "#facc38",
        },
        {
            key: "free",
            label: "Přání, která můžete plnit",
            color: "#d42e3c",
        }
    ]

    requestAnimationFrame(function() {
        prepareProprotionsGraph(stats, wishCats)

        requestAnimationFrame(function() {
            prepareCountGraph(stats, wishCats)

            requestAnimationFrame(function() {
                prepareMoneyGraph(stats, wishCats)
            })
        })
    })
}

function formatBigNum(num) {
    num = num + ""
    var res = ""
    var end = num.length
    for(var s = end - 3; s >= 0; s -= 3) {
        res = " " + num.substring(s, end) + res
        end = s
    }
    return num.substring(0, end) + res
}

function prepareProprotionsGraph(stats, wishCats) {
    var proportionDatasets = wishCats.map(function(cat) {
        return {
            data: new Array(stats.completed.length),
            label: cat.label,
            backgroundColor: cat.color,
            pointHoverRadius: 8,
            pointHoverBorderColor: "grey",
            pointRadius: 0,
        }
    })
    for(var i = 0; i < stats.completed.length; ++i) {
        var total = 0
        for(var x = 0; x < wishCats.length; ++x) {
            var c = wishCats[x]
            proportionDatasets[x].data[i] = {
                y: stats[c.key][i].y,
                t: stats[c.key][i].t,
            }
            total += stats[c.key][i].y
        }
        for(var x = 0; x < wishCats.length; ++x) {
            var c = wishCats[x]
            var v = proportionDatasets[x].data[i]
            v.y = v.y / total * 100;
        }
    }

    new Chart("wishes_stacked", {
        type: 'line',
        data: {
            datasets: proportionDatasets,
        },
        options: {
            hover: {
                intersect: false,
            },
            scales: {
                yAxes: [{
                    stacked: true,
                    ticks: {
                        min: 0,
                        max: 100,
                        callback: function(value, index, values) {
                            return value + '%';
                        }
                    }
                }],
                xAxes: [{
                    type: "time",
                    time: {
                        parser: function(val) {
                            return moment(val, "X")
                        },
                        unit: "hour",
                        displayFormats: {
                            hour: "D. MMM, H:mm",
                        },
                        tooltipFormat: "D. MMMM, H:mm"
                    }
                }]
            },
            tooltips: {
                mode: 'index',
                intersect: false,
                callbacks: {
                    label: function(it, data) {
                        return data.datasets[it.datasetIndex].label + ": " + it.yLabel.toFixed(1) + "%"
                    }
                }
            }
        }
    });
}

function prepareCountGraph(stats, wishCats) {
    var datasets = wishCats.map(function(cat) {
        return {
            data: new Array(stats.completed.length),
            label: cat.label,
            backgroundColor: cat.color,
            pointHoverRadius: 8,
            pointHoverBorderColor: "grey",
            pointRadius: 0,
        }
    })

    for(var i = 0; i < stats.completed.length; ++i) {
        for(var x = 0; x < wishCats.length; ++x) {
            var c = wishCats[x]
            datasets[x].data[i] = stats[c.key][i]
        }
    }

    new Chart("wishes_count", {
        type: 'line',
        data: {
            datasets: datasets,
        },
        options: {
            hover: {
                intersect: false,
            },
            scales: {
                yAxes: [{
                    stacked: true,
                    ticks: {
                        callback: function(value, index, values) {
                            return formatBigNum(value)
                        }
                    },
                }],
                xAxes: [{
                    type: "time",
                    time: {
                        parser: function(val) {
                            return moment(val, "X")
                        },
                        unit: "hour",
                        displayFormats: {
                            hour: "D. MMM, H:mm",
                        },
                        tooltipFormat: "D. MMMM, H:mm"
                    }
                }]
            },
            tooltips: {
                mode: 'index',
                intersect: false,
                callbacks: {
                    label: function(it, data) {
                        return data.datasets[it.datasetIndex].label + ": " + formatBigNum(it.yLabel)
                    }
                }
            }
        }
    });
}

function prepareMoneyGraph(stats) {
    new Chart("money", {
        type: 'line',
        data: {
            datasets: [
                {
                    data: stats.money,
                    label: "Peníze",
                    backgroundColor: "#5bc0de",
                    pointHoverRadius: 8,
                    pointHoverBorderColor: "grey",
                    pointRadius: 0,
                }
            ],
        },
        options: {
            hover: {
                intersect: false,
            },
            legend: {
                display: false,
            },
            scales: {
                yAxes: [{
                    stacked: true,
                    ticks: {
                        callback: function(value, index, values) {
                            return formatBigNum(value) + ' Kč';
                        }
                    },
                }],
                xAxes: [{
                    type: "time",
                    time: {
                        parser: function(val) {
                            return moment(val, "X")
                        },
                        unit: "hour",
                        displayFormats: {
                            hour: "D. MMM, H:mm",
                        },
                        tooltipFormat: "D. MMMM, H:mm"
                    }
                }]
            },
            tooltips: {
                mode: 'index',
                intersect: false,
                callbacks: {
                    label: function(it, data) {
                        return data.datasets[it.datasetIndex].label + ": " + formatBigNum(it.yLabel) + " Kč"
                    }
                }
            }
        }
    });
}

function onMapDataLoad(req) {
    var locations = JSON.parse(req.responseText);

    locations["CZE"] = {
        fillKey: "master",
    }

    new Datamap({
        element: document.getElementById("worldmap"),
        projection: 'mercator',
        geographyConfig: {
            popupOnHover: true,
            highlightOnHover: true,
            popupTemplate: function(geography, data) {
                var res = '<div class="hoverinfo"><strong>' + geography.properties.name + '</strong>';
                if(data && data["messages"]) {
                    res += "<ul>"
                    data["messages"].forEach(function(m) {
                        res += "<i>" + m + "</i><br>"
                    })
                    res += "</ul>"
                }
                return res + "</div>"
            },
        },
        fills: {
          defaultFill: "#ddd",
          sent: "#169eda",
          master: "#85b52d"
        },
        data: locations,
      });
}

(function() {
    moment.locale("cs");

    document.querySelectorAll(".chart").forEach(function(el) {
        var px = (el.clientWidth / 16 * 9) | 0;
        el.style.height = px + "px";
    });

    var req = new XMLHttpRequest();
    req.open("GET", "stats.json");
    req.onload = onStatsDataLoad.bind(this, req);
    req.send();

    req = new XMLHttpRequest();
    req.open("GET", "locations.json");
    req.onload = onMapDataLoad.bind(this, req);
    req.send();
})();
