window.addEventListener('load', () => {
    const page = {
        loadingContainer: document.getElementById("loading-panel"),
        login: {
            container: document.getElementById('login-panel'),
            username: document.getElementById("username"),
            password: document.getElementById("password"),
            open: document.getElementById("open-btn"),
            error: document.getElementById("open-error"),
        },
        prediction: {
            container: document.getElementById('prediction-panel'),
            row: document.getElementById('predictions-row'),
        },
        info: {
            flag: document.getElementById("country-flag"),
            name: document.getElementById("country-name"),
            seeding: document.getElementById("country-2025-seeding"),
            placement: document.getElementById("country-2025-placement"),
            roster2025: document.getElementById("country-roster-2025"),
            roster2026: document.getElementById("country-roster-2026"),
            noTeam2025: document.getElementById("country-no-team-2025"),
        },
        action: {
            bar: document.getElementById("action-bar"),
            previousBtn: document.getElementById("previous-btn"),
            nextBtn: document.getElementById("next-btn")
        }
    };
    const PLACEMENTS = ["1st", "2nd", "3rd", "4th", "5th-6th", "7th-8th", "9th-12th", "13th-16th", "17th-24th", "25th-32nd", "DNQ"];

    let teams26 = null;
    let teams25 = null;
    let teamsOrder = null;
    let username = "";
    let password = "";
    let loggedIn = false;
    let isGuest = false;
    let ws = null;
    let connectionAttempts = 0;
    let state = null;

    function switchScenes(scene) {
        page.loadingContainer.classList.add('hidden');
        page.login.container.classList.add('hidden');
        page.prediction.container.classList.add('hidden');
        page.action.bar.classList.add("hidden");
        switch (scene) {
            case 'loading': {
                page.loadingContainer.classList.remove('hidden');
                break;
            }
            case 'login': {
                page.login.container.classList.remove('hidden');
                break;
            }
            case 'prediction': {
                page.prediction.container.classList.remove('hidden');
                if (loggedIn) {
                    page.action.bar.classList.remove("hidden");
                }
                break;
            }
        }
    }

    function getCountryCode(teamName) {
        for (const team of teams26) {
            if (team.name === teamName) {
                return team.country;
            }
        }
        return "";
    }

    let draggingTeam = null;
    function setupFlagDragging(flag) {
        flag.addEventListener("mousedown", () => {
            draggingTeam = flag.getAttribute("data-team");
        });
    }
    document.addEventListener("mouseup", (evt) => {
        if (draggingTeam && evt.target.classList.contains("tierlist-label")) {
            setPrediction(draggingTeam, evt.target.getAttribute("data-placement"));
        }
        draggingTeam = null;
    });

    function drawState() {
        if (state.currentTab) {
            setTeamInfo(state.currentTab);

            page.action.previousBtn.classList.remove("hidden");
            page.action.nextBtn.classList.remove("hidden");
            const teamI = teamsOrder.indexOf(state.currentTab);
            if (teamI === 0) {
                page.action.previousBtn.classList.add("hidden");
                page.action.nextBtn.value = `Next (${teamsOrder[teamI+1]})`;
            } else if (teamI === teamsOrder.length - 1) {
                page.action.nextBtn.classList.add("hidden");
                page.action.previousBtn.value = `Previous (${teamsOrder[teamI-1]})`;
            } else {
                page.action.nextBtn.value = `Next (${teamsOrder[teamI+1]})`;
                page.action.previousBtn.value = `Previous (${teamsOrder[teamI-1]})`;
            }
        }

        for (const [commentator, predictions] of Object.entries(state.predictions)) {
            const predictionId = `prediction-${commentator}`;
            let prediction = document.getElementById(predictionId);
            if (!prediction) {
                prediction = document.createElement("div");
                prediction.id = predictionId;
                prediction.classList = "prediction";
                const commentatorInfo = document.createElement("div");
                commentatorInfo.className = "commentator-info";
                const commentatorName = document.createElement("h1");
                commentatorName.className = "commentator-name";
                commentatorName.innerText = commentator + ":"
                const commentatorPrediction = document.createElement("h1");
                commentatorPrediction.className = "commentator-prediction";
                commentatorInfo.append(commentatorName, commentatorPrediction);
                const tierlist = document.createElement("div");
                tierlist.className = "tierlist prevent-select";
                for (const placement of PLACEMENTS) {
                    const label = document.createElement("h1");
                    label.innerText = placement;
                    label.classList.add("tierlist-label");
                    label.setAttribute("data-placement", placement);
                    switch (placement) {
                        case "1st": {
                            label.classList.add("first");
                            break;
                        }
                        case "2nd": {
                            label.classList.add("second");
                            break;
                        }
                        case "3rd": {
                            label.classList.add("third");
                            break;
                        }
                    }
                    const row = document.createElement("div");
                    row.className = "tierlist-row";
                    row.setAttribute("data-placement", placement);
                    tierlist.append(label, row);
                }
                prediction.append(tierlist, commentatorInfo);
                page.prediction.row.append(prediction);
            }

            const tierlist = prediction.querySelector("div.tierlist");
            for (const row of tierlist.children) {
                if (row.className !== "tierlist-row") {
                    continue;
                }

                const placement = row.getAttribute("data-placement");

                if (loggedIn && commentator === username) {
                    const label = tierlist.querySelector(`h1[data-placement="${placement}"]`);
                    if (!label.classList.contains("clickable")) {
                        label.addEventListener(
                            "click",
                            () => setPrediction(state.currentTab, placement)
                        );
                        label.classList.add("clickable");
                    }
                    for (const flag of row.children) {
                        if (!flag.classList.contains("clickable")) {
                            flag.classList.add("clickable");
                            setupFlagDragging(flag);
                        }
                    }
                }

                const placementPredictions = predictions[placement];
                const existingTeams = [];
                for (let i=0; i<row.children.length;) {
                    const flag = row.children.item(i);
                    const team = flag.getAttribute("data-team");
                    if (!placementPredictions.includes(team)) {
                        flag.remove();
                    } else {
                        existingTeams.push(team);
                        i++;
                    }
                }
                for (const team of placementPredictions) {
                    if (!existingTeams.includes(team)) {
                        const flagContainer = document.createElement("div");
                        flagContainer.setAttribute("data-team", team);
                        flagContainer.className = "flag-img-container";
                        const flagImg = document.createElement("img");
                        flagImg.className = "flag-img";
                        flagImg.src = `https://flagsapi.com/${getCountryCode(team)}/flat/32.png`
                        const flagOvertext = document.createElement("h1");
                        flagOvertext.className = "flag-overtext";
                        if (team[team.length-2] === " ") {
                            flagOvertext.innerText = team[team.length-1];
                        }
                        flagContainer.append(flagImg, flagOvertext);
                        row.append(flagContainer);
                        if (loggedIn && commentator === username) {
                            flagContainer.classList.add("clickable");
                            setupFlagDragging(flagContainer);
                        }
                    }
                }
            }

            const commentatorPrediction = prediction.querySelector("h1.commentator-prediction");
            if (state.currentTab) {
                let hasPred = false;
                for (const [placement, teams] of Object.entries(predictions)) {
                    if (teams.includes(state.currentTab)) {
                        commentatorPrediction.innerText = placement;
                        hasPred = true;
                        break;
                    }
                }
                if (!hasPred) {
                    commentatorPrediction.innerText = "";
                }
            } else {
                commentatorPrediction.innerText = "";
            }
        }
    }

    function createPlayerElement(player, removed, added) {
        const img = document.createElement('img');
        img.className = "player-pfp";
        img.src = `https://a.ppy.sh/${player.id}`;
        const playerName = document.createElement("h1");
        playerName.innerText = player.username;
        const container = document.createElement("a");
        container.classList.add("player");
        container.href = "https://osu.ppy.sh/u/" + player.id;
        container.target = "_blank";
        if (removed) {
            container.classList.add("removed");
        } else if (added) {
            container.classList.add("added");
        }
        container.append(img, playerName);
        return container;
    }

    function setTeamInfo(team) {
        // match e.g. Argentina to Argentina A
        const validTeamNames = [team];
        if (team[team.length - 2] === " " && team[team.length - 1] === "A") {
            validTeamNames.push(team.substring(0, team.length - 2));
        } else {
            validTeamNames.push(team + " A");
        }
        const data26 = teams26.find((item) => validTeamNames.includes(item.name));
        const data25 = teams25.find((item) => validTeamNames.includes(item.name));
        if (!data26) {
            return;
        }

        page.info.flag.src = `https://flagsapi.com/${data26.country}/flat/64.png`;
        page.info.name.innerText = data26.name;
        page.info.seeding.innerText = "2025 Seeding: " + data26.history["2025"].seeding;
        page.info.placement.innerText = "2025 Placement: " + data26.history["2025"].placement;
        while (page.info.roster2025.children.length > 0) {
            page.info.roster2025.children.item(0).remove();
        }
        while (page.info.roster2026.children.length > 0) {
            page.info.roster2026.children.item(0).remove();
        }

        if (!data25) {
            page.info.noTeam2025.classList.remove('hidden');
        } else {
            page.info.noTeam2025.classList.add('hidden');
            for (const player of data25.players) {
                const removed = !data26.players.find((item) => item.id === player.id);
                const element = createPlayerElement(player, removed, false);
                page.info.roster2025.append(element);
            }
        }

        for (const player of data26.players) {
            const added = !data25 ? false : !data25.players.find((item) => item.id === player.id);
            const element = createPlayerElement(player, false, added);
            page.info.roster2026.append(element);
        }
    }

    function handleMessage(msg) {
        const data = JSON.parse(msg.data);
        if (data.error !== undefined) {
            page.login.error.innerText = data.error;
            switchScenes('login');
            return;
        }

        if (data.type === 1) {
            loggedIn = true;
            switchScenes('prediction');
            console.log('Login successful');
        } else if (data.type === 2) {
            state = data;
            drawState();
            console.log("State updated");
        }
    }

    function setPrediction(teamName, placement) {
        if (!ws || !loggedIn) {
            return;
        }

        console.log(`Setting prediction ${placement} for ${teamName}`);
        ws.send(JSON.stringify({type: 2, country: teamName, placement}));
    }

    function login() {
        if (!ws) {
            return;
        }

        console.log("Logging in");
        ws.send(JSON.stringify({ type: 1, username: username, pw: password }));
    }

    function connect(wsUrl) {
        if (connectionAttempts === 3) {
            console.log("Maximum connection attempts has been reached")
            return;
        }

        console.log("Connecting to " + wsUrl);

        connectionAttempts += 1;
        ws = new WebSocket(wsUrl);
        ws.addEventListener('open', () => {
            console.log("Connected!");
            connectionAttempts = 0;

            if (username !== "") {
                login();
            } else if (isGuest) {
                switchScenes("prediction");
            } else {
                switchScenes("login");
            }
        });
        ws.addEventListener('message', handleMessage);
        ws.addEventListener('close', () => {
            console.log("Connection closed... attempting to reconnect in 3 seconds");
            setTimeout(() => connect(wsUrl), 3000);
            loggedIn = false;
            ws = null;
        });
    }

    function setup() {
        const params = new URLSearchParams(window.location.search);
        if (params.has("overlay")) {
            isGuest = true;
        }

        let wsUrl
        if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
            wsUrl = "ws://127.0.0.1:8727"
        } else {
            const domain = window.location.port ? window.location.hostname + ":" + window.location.port : window.location.hostname;
            wsUrl = (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + domain + "/ws";
        }
        connect(wsUrl);
    }

    switchScenes('loading');

    function isReady() {
        return teams25 && teams26;
    }
    fetch(`/public/data/teams26.json`).then(resp => resp.json()).then((data) => {
        teams26 = data;
        teamsOrder = teams26.map((team) => team.name).sort();
        if (isReady()) {
            setup();
        }
    });
    fetch(`/public/data/teams25.json`).then(resp => resp.json()).then((data) => {
        teams25 = data;
        if (isReady()) {
            setup();
        }
    });

    page.login.open.addEventListener('click', () => {
        username = page.login.username.value;
        password = page.login.password.value;

        if (!username) {
            isGuest = true;
            switchScenes('prediction');
            return;
        }

        login();
    });
    page.action.nextBtn.addEventListener('click', () => {
        if (!loggedIn || !ws || !state || !state.currentTab) {
            return;
        }

        const teamI = teamsOrder.indexOf(state.currentTab);
        if (teamI === teamsOrder.length - 1) {
            return;
        }
        const newTeam = teamsOrder[teamI+1];
        ws.send(JSON.stringify({type: 3, tab: newTeam}));
        state.currentTab = newTeam;
        setTeamInfo(newTeam);
    });
    page.action.previousBtn.addEventListener("click", () => {
        if (!loggedIn || !ws || !state || !state.currentTab) {
            return;
        }

        const teamI = teamsOrder.indexOf(state.currentTab);
        if (teamI === 0) {
            return;
        }
        const newTeam = teamsOrder[teamI-1];
        ws.send(JSON.stringify({type: 3, tab: newTeam}));
        state.currentTab = newTeam;
        setTeamInfo(newTeam);
    });
});
