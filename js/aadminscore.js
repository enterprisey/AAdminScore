/* jshint moz: true */
$( document ).ready( function () {
    const MILLISECONDS_IN_DAY = 1000 * 60 * 60 * 24,
          EDIT_COUNT_MULTIPLIER = 1.25,
          BLOCK_COUNT_MULTIPLIER = 1.4,
          ACCOUNT_AGE_MULTIPLIER = 1.25,
          ARTICLES_CREATED_MULTIPLIER = 1.4,
          ACTIVITY_MULTIPLIER = 0.9,
          API_ROOT = "https://en.wikipedia.org/w/api.php",
          API_SUFFIX = "&format=json&callback=?&continue=";

    var scoreComponents = {
        "Edit count": {
            url: function ( username ) {
                return [ API_ROOT + "?action=query&list=users&usprop=editcount&ususers=User:" + username + API_SUFFIX ];
            },
            metric: function ( data ) {
                var count = data.query.users[ 0 ].editcount;
                return { raw: count, formatted: numberWithCommas( count ) };
            },
            delta: function ( edits ) {
                if ( edits < 350 ) {
                    return EDIT_COUNT_MULTIPLIER * -200;
                } else {
                    return EDIT_COUNT_MULTIPLIER *
                        ( 71.513 * Math.log( edits ) - 621.0874 );
                }
            }
        },
        "Blocks": {
            url: function ( username ) {
                return [ API_ROOT + "?action=query&list=users&ususers=" + username + "&usprop=blockinfo" + API_SUFFIX,
                        API_ROOT + "?action=query&list=logevents&letitle=User:" + username + "&leaction=block/block" + API_SUFFIX ];
            },
            metric: function ( statusData, pastData ) {
                statusData = statusData[ 0 ]; // because $.when does funky stuff
                pastData = pastData[ 0 ];
                var hasentry = statusData.query.users[ 0 ].hasOwnProperty( "blockexpiry" );
                if ( statusData.query.users[ 0 ].hasOwnProperty( "blockexpiry" ) ) {
                    var duration = statusData.query.users[ 0 ].blockexpiry;
                    return {
                        raw: duration,
                        formatted: ( ( duration === "infinity" ) ?
                                     "<b>indefinitely blocked</b>" :
                                     ( "currently blocked for " + duration ) )
                    };
                } else {
                    var blockCount = pastData.query.logevents.length;
                    if ( blockCount === 0 ) {
                        return { raw: { count: 0, since: NaN }, formatted: "never blocked" };
                    } else {
                        var sinceLast = ( Date.now() - Date.parse( pastData.query.logevents[ 0 ].timestamp ) ) / MILLISECONDS_IN_DAY;
                        return {
                            raw: { count: blockCount, since: sinceLast },
                            formatted: blockCount + " block" + ( blockCount == 1 ? "" : "s" ) +
                                " (last one was " + numberWithCommas( sinceLast.toFixed( 1 ) ) + " days ago)"
                        };
                    }
                }
            },
            delta: function ( metric ) {
                if ( metric === "infinity" ) {
                    return -500;
                } else if ( !metric.hasOwnProperty( "count" ) ) {
                    return -100; // user currently blocked
                } else {
                    if ( metric.count === 0 ) {
                        return BLOCK_COUNT_MULTIPLIER * 100;
                    } else {
                        var score = 0.1977 * metric.since - 92.3255;
                        score -= 10 * metric.count;
                        if ( score > 100 ) {
                            score = 100;
                        }
                        return BLOCK_COUNT_MULTIPLIER * score;
                    }
                }
            }
        },
        "Account age": {
            url: function ( username ) {
                return [ API_ROOT + "?action=query&list=users&ususers=" + username + "&usprop=registration" + API_SUFFIX ];
            },
            metric: function ( data ) {
                var numDays = ( Date.now() - Date.parse( data.query.users[ 0 ].registration ) ) / MILLISECONDS_IN_DAY,
                    numDaysFormatted = numberWithCommas( numDays.toFixed( 1 ) ),
                    numYearsFormatted = ( numDays / 365 ).toFixed( 2 );
                return { raw: numDays, formatted: numDaysFormatted + " days (" +
                         numYearsFormatted + " years)" };
            },
            delta: function ( metric ) {
                if ( metric < 43 ) {
                    return ACCOUNT_AGE_MULTIPLIER * -200;
                } else {
                    return ACCOUNT_AGE_MULTIPLIER *
                        ( 91.482 * Math.log( metric ) - 544.85 );
                }
            }
        },
        "User page": {
            url: function ( username ) {
                return [ API_ROOT + "?action=query&prop=revisions&rvprop=content&titles=User:" + username + API_SUFFIX ];
            },
            metric: function ( data ) {
                if ( data.query.pages.hasOwnProperty( "-1" ) ) {
                    return { raw: "missing", formatted: "missing" };
                } else {
                    var pageid = Object.keys( data.query.pages )[ 0 ],
                        text = data.query.pages[ pageid ].revisions[ 0 ][ "*" ],
                        redirect = text.lastIndexOf( "#REDIRECT", 0 ) === 0,
                        result = redirect ? "redirect" : "exists";
                    return { raw: result, formatted: result };
                }
            },
            delta: function ( metric ) {
                switch ( metric ) {
                case "missing":
                    return -50;
                case "redirect":
                    return -10;
                case "exists":
                    return 10;
                }
            }
        },
        "User rights": {
            url: function ( username ) {
                return [ API_ROOT + "?action=query&list=users&usprop=groups&ususers=" + username + API_SUFFIX ];
            },
            metric: function ( data ) {
                var unimportantGroups = [ "*", "user", "autoconfirmed" ],
                    goodGroup = function ( group ) {
                        return unimportantGroups.indexOf( group ) < 0;
                    },
                    groups = $.grep( data.query.users[ 0 ].groups,
                                     goodGroup );
                if ( groups.length === 0 ) {
                    return { raw: groups, formatted: "none" };
                } else if ( groups.length === 1 ) {
                    return { raw: groups, formatted: groups[ 0 ] };
                } else if ( groups.length === 2 ) {
                    return { raw: groups,
                             formatted: groups[ 0 ] + " and " + groups[ 1 ] };
                } else {
                    var formattedMetric = groups[ 0 ];
                    for ( var i = 1; i < groups.length - 1; i++ ) {
                        formattedMetric += ", " + groups[ i ];
                    }
                    formattedMetric += ", and " + groups[ groups.length - 1 ];
                    return { raw: groups, formatted: formattedMetric };
                }
            },
            delta: function ( groups ) {
                var score = 0;
                const groupScores = { "abusefilter": 25,
                                     "accountcreator": 10,
                                     "autoreviewer": 20,
                                     "checkuser": 25,
                                     "filemover": 15,
                                     "reviewer": 5,
                                     "rollbacker": 5,
                                     "templateeditor": 20 };
                for ( var i = 0; i < groups.length; i++ ) {
                    if ( groupScores.hasOwnProperty( groups[ i ] ) ) {
                        score += groupScores[ groups[ i ] ];
                    }
                    if ( groups[ i ] === "sysop" || groups[ i ] === "bureaucrat" ) {
                        return 500;
                    }
                }
                if ( score > 100 ) {
                    score = 100;
                }
                return score;
            }
        },
        "Pages created": {
            usesListLength: true,
            url: function ( username ) {
                return [ API_ROOT + "?action=query&list=usercontribs&ucuser=" + username + "&uclimit=500&ucdir=older&ucprop=title&ucshow=new&ucnamespace=0" + API_SUFFIX ];
            },
            getList: function ( data ) {
                return data.query.usercontribs;
            },
            metric: function ( count ) {
                return { raw: count,
                         formatted: count + " article-space pages created" };
            },
            delta: function ( metric ) {
                var rawDelta = 36.07161 * Math.log( metric ) - 68.8246;
                if ( rawDelta < -100 ) {
                    rawDelta = -100;
                }
                return ARTICLES_CREATED_MULTIPLIER * rawDelta;
            }
        },
        "Activity": {
            usesListLength: true,
            url: function ( username ) {
                var aYearAgo = new Date();
                aYearAgo.setFullYear( aYearAgo.getFullYear() - 1 );
                aYearAgo = aYearAgo.toISOString();
                return [ API_ROOT + "?action=query&list=usercontribs&ucuser=" + username + "&uclimit=500&ucprop=timestamp&ucend=" + aYearAgo + API_SUFFIX ];
            },
            getList: function ( data ) {
                return data.query.usercontribs;
            },
            metric: function ( editsOverPastYear ) {
                var avgEditsPerMonth = editsOverPastYear / 12;
                var avgEditsPerMonthFmt =
                    numberWithCommas( avgEditsPerMonth.toFixed( 1 ) );
                return { raw: avgEditsPerMonth,
                         formatted: avgEditsPerMonthFmt +
                         " edits per month, on average (over the last year)" };
            },
            delta: function ( metric ) {
                // Only 50 because I have yet to add the minimum edits per month
                var rawDelta = 30.41375 * Math.log( metric ) - 138.48563;
                if ( rawDelta < -50 ) {
                    rawDelta = -50;
                }
                return ACTIVITY_MULTIPLIER * rawDelta;
            }
        }
    };

    var showScore = function () {
        var username = $( "#username" ).val();
        $( "#error" ).hide();
        $( "#result" ).hide();
        if ( username === "" ) {
            $( "#error" ).empty();
            $( "#error" ).show();
            $( "#error" ).append( $( "<div>" )
                               .addClass( "errorbox" )
                               .text( "No username specified." ) );
            return;
        }
        $( "#result" ).show();
        $( "#score_wrapper" )
            .empty()
            .append( "<span>Admin score for <a href='https://en.wikipedia.org/wiki/" +
                     "User:" + username + "'>" + username + "</a>: </span>" )
            .append( $( "<span>" )
                         .text( "0" )
                         .attr( "id", "score" ) );
        $( "#components" ).empty();
        $( "#components" ).append( "<tr><th>Component</th><th>Data</th><th>Score</th></tr>" );
        d3.selectAll( "svg" ).selectAll( "*" ).remove();

        $.each( scoreComponents, function ( name, functions ) {

            // First, add our own table row to #components that we'll update
            var componentRow = $( "<tr>" )
                .appendTo( "#components" )
                .append( "<td>" + name + "</td>" )
                .append( "<td colspan='2' class='loading'>Loading...</td>" );
            var display = function ( metric ) {
                var delta = functions.delta( metric.raw );
                if ( name !== "Block status" || delta !== 0 ) {

                    // The d3 graph reads these attributes, so add them
                    componentRow
                        .attr( "delta", delta )
                        .attr( "name", name )
                        .addClass( "score_component" );

                    componentRow.empty()
                        .append( "<td>" + name + "</td><td>" +
                                 metric.formatted + "</td><td>" +
                                 formatDelta( delta ).prop( "outerHTML" ) +
                                 "</td>" );

                    // Update the score element
                    var oldScore = parseFloat( $( "#score" )
                                               .text()
                                               .replace( /,/, "" ) ),
                        currentScore = oldScore + delta;
                    currentScore = currentScore.toFixed( 1 );
                    $( "#score" ).text( numberWithCommas( currentScore ) );
                }

                // Another component has loaded, so update the graph
                updateMainGraph();
            }; // End display() function
            var urls = functions.url( username );

            //console.log( name + " -> " + JSON.stringify( urls ) );

            if ( urls.length == 1 ) {
                if ( functions.hasOwnProperty( "usesListLength" ) ) {
                    var runningTotal = 0,
                        baseUrl = urls[ 0 ].replace( /continue=/, "" );
                        query = function ( continueData ) {
                            var queryUrl = baseUrl + continueData;
                            $.getJSON( queryUrl, function ( data ) {
                                var newList = functions.getList( data );
                                runningTotal += newList.length;
                                if ( data.hasOwnProperty( "continue" ) ) {

                                    // There's some more - recurse
                                    var newContinueData = "uccontinue=" +
                                        data.continue.uccontinue +
                                        "&continue=" + data.continue.continue;
                                    query( newContinueData );
                                } else {

                                    // Nothing else, so we're done
                                    display( functions.metric( runningTotal ) );
                                }
                            } );
                        };

                    query( "continue=" );
                } else {
                    $.getJSON( urls[ 0 ], function ( data ) {
                        display( functions.metric( data ) );
                    } );
                }
            } else if ( urls.length == 2 ) {
                $.when(
                    $.getJSON( urls[ 0 ] ),
                    $.getJSON( urls[ 1 ] )
                ).then( function ( data0, data1 ) {
                    display( functions.metric( data0, data1 ) );
                } );
            }
        } ); // end $.each
    }; // end form submission handler

    // Bind form submission handler to submission button & username field
    $( "#submit" ).click( showScore );
    $( "#username" ).keyup( function ( e ) {
        if ( e.keyCode == 13 ) {

            // Enter was pressed in the username field
            showScore();
        }
    } );

    if ( window.location.hash && window.location.hash.indexOf( "#user=" ) >= 0 ) {

        // In the past, we let the hash specify the user, like #user=Example
        $( "#username" ).val( decodeURIComponent( window.location.hash.replace( /^#user=/, "" ) ) );
        $( "#submit" ).trigger( "click" );
    } else if( window.location.search.substring( 1 ).indexOf( "user=" ) >= 0 ) {

        // Allow the user to be specified in the query string, like ?user=Example
        var userArgMatch = /&?user=([^&#]*)/.exec( window.location.search.substring( 1 ) );
        if( userArgMatch && userArgMatch[1] ) {
            $( "#username" ).val( decodeURIComponent( userArgMatch[1].replace( /\+/g, " " ) ) );
            $( "#submit" ).trigger( "click" );
        }
    }

    const MAIN_GRAPH_WIDTH = 500,
          MAX_MAIN_GRAPH_HEIGHT = 200,
          MAIN_GRAPH_BAR_PADDING = 2,
          MAIN_GRAPH_PADDING = 20,
          MAIN_GRAPH_TEXT_WIDTH_FUDGE_FACTOR = 50,
          MAIN_GRAPH_BAR_LABEL_PADDING = 5;

    function updateMainGraph() {
        var runningTotals = [],
            deltaSigns = [], // stores whether each component is + (true) or - (false)
            runningTotal = 0;

        $( ".score_component" ).each( function () {
            var delta = parseFloat( $( this ).attr( "delta" ) ),
                name = $( this ).attr( "name" );
            if ( delta === 0 ) {
                return;
            }
            runningTotal += delta;
            runningTotals.push( [ runningTotal, name ] );
            deltaSigns.push( delta >= 0 );
        } );

        var bar_height = 20,
            spacePaddingTakesUp = ( ( runningTotals.length - 1 ) *
                                    MAIN_GRAPH_BAR_PADDING ),
            spaceBarsTakeUp = runningTotals.length * bar_height,
            preferredHeight = spacePaddingTakesUp + spaceBarsTakeUp;
            height = Math.min( MAX_MAIN_GRAPH_HEIGHT, preferredHeight );

        var xExtent = d3.extent( runningTotals,
                                 function ( d ) { return d[ 0 ]; } );
        xExtent[ 0 ] = Math.min( 0, xExtent[ 0 ] );
        xExtent[ 1 ] = Math.max( 0, xExtent[ 1 ] );
        var xScale = d3.scale.linear()
            .domain( xExtent )
            .rangeRound( [ MAIN_GRAPH_PADDING,
                           MAIN_GRAPH_WIDTH - MAIN_GRAPH_PADDING * 2 ] );

        var xAxis = d3.svg.axis()
            .scale( xScale )
            .orient( "bottom" )
            .ticks( 7 );

        runningTotals = $.map( runningTotals,
                               function ( d ) {
                                   return [ [ xScale( d[ 0 ] ), d[ 1 ] ] ];
                               } );

        var svg = d3.select( "svg" )
            .attr( "width", MAIN_GRAPH_WIDTH +
                   MAIN_GRAPH_TEXT_WIDTH_FUDGE_FACTOR )
            .attr( "height", height + MAIN_GRAPH_PADDING );

        svg.selectAll( "*" ).remove();

        var nextX = MAIN_GRAPH_WIDTH / 2,
            dToX = function ( d, i, xOff ) {
                xOff = xOff || 0;
                if ( i === 0 ) {
                    return Math.min( d[ 0 ], xScale( 0 ) ) + xOff;
                } else {
                    var result = Math.min( d[ 0 ],
                                           runningTotals[ i - 1 ][ 0 ] ) + xOff;
                    return result;
                }
            },
            dToWidth = function ( d, i ) {
                if ( i === 0 ) {
                    return Math.abs( xScale( 0 ) - d[ 0 ] );
                } else {
                    return Math.abs( d[ 0 ] - runningTotals[ i - 1 ][ 0 ] );
                }
            };

        svg.selectAll( "rect" )
            .data( runningTotals )
            .enter()
            .append( "rect" )
            .attr( "x", dToX )
            .attr( "y", function ( d, i ) {
                return i * bar_height;
            } )
            .attr( "width", dToWidth )
            .attr( "height", function ( d, i ) {
                return bar_height - MAIN_GRAPH_BAR_PADDING;
            } )
            .attr( "class", function ( d, i ) {
                return ( deltaSigns[i] ? "positive" : "negative" ) + "-delta";
            } );

        svg.selectAll( "text" )
            .data( runningTotals )
            .enter()
            .append( "text" )
            .text( function ( d ) {
                return d[ 1 ];
            } )
            .attr( "class", "bar-label" )
            .attr( "x", function ( d, i ) {
                var result = dToX( d, i, MAIN_GRAPH_BAR_LABEL_PADDING ),
                    barWidth = dToWidth( d, i );
                if ( this.getComputedTextLength() >=
                     barWidth - MAIN_GRAPH_BAR_LABEL_PADDING * 2 ) {
                    result += barWidth;
                    result -= MAIN_GRAPH_BAR_LABEL_PADDING / 2;
                }
                return result;
            } )
            .attr( "y", function ( d, i ) {
                return i * bar_height + 14;
            } )
            .attr( "fill", function ( d, i ) {
                var tooLong = this.getComputedTextLength() >=
                    dToWidth( d, i ) - MAIN_GRAPH_BAR_LABEL_PADDING * 2;
                return tooLong ? "black" : "white";
            } );

        svg.append( "g" )
            .attr( "class", "graph-axis" )
            .attr( "transform", "translate(0, " + height + ")" )
            .call( xAxis );
    }

    // Utility function; from http://stackoverflow.com/a/2901298/1757964
    function numberWithCommas( x ) {
        var parts = x.toString().split( "." );
        parts[ 0 ] = parts[ 0 ].replace( /\B(?=(\d{3})+(?!\d))/g, "," );
        return parts.join( "." );
    }

    function formatDelta( delta ) {
        var classModifier = ( delta >= 0 ? "constructive" : "destructive" );
        return $( "<span>" )
            .text( ( delta < 0 ? "" : "+" ) + delta.toFixed( 2 ) )
            .addClass( "mw-ui-text" )
            .addClass( "mw-ui-" + classModifier );
    }
} );
