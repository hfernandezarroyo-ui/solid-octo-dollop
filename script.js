async function getTeamId(teamName) {
    try {
        const res = await fetch(`${BASE_URL}/teams?name=${encodeURIComponent(teamName)}`, {
            headers: { "Authorization": `Bearer ${API_KEY}` }
        });
        const data = await res.json();
        if (!data.length) {
            console.warn(`No se encontró el equipo: ${teamName}`);
            return null;
        }
        return data[0].id;
    } catch (err) {
        console.error("Error obteniendo ID del equipo", err);
        return null;
    }
}

async function getH2H(teamAName, teamBName) {
    const teamAId = await getTeamId(teamAName);
    const teamBId = await getTeamId(teamBName);

    if (!teamAId || !teamBId) {
        console.error("No se pudieron obtener los IDs de ambos equipos.");
        return [];
    }

    try {
        const res = await fetch(`${BASE_URL}/matches?start_time_from=2017-01-01&start_time_to=2030-01-01`, {
            headers: { "Authorization": `Bearer ${API_KEY}` }
        });
        const data = await res.json();

        return data.filter(m =>
            (m.home_team_id === teamAId && m.away_team_id === teamBId) ||
            (m.home_team_id === teamBId && m.away_team_id === teamAId)
        );
    } catch (err) {
        console.error("Error obteniendo historial H2H", err);
        return [];
    }
}

// Ejemplo: buscar historial y mostrarlo en consola
document.getElementById("buscarH2H").addEventListener("click", async () => {
    const teamAName = document.getElementById("teamA").value.trim();
    const teamBName = document.getElementById("teamB").value.trim();

    if (!teamAName || !teamBName) {
        alert("Por favor, escribe los nombres de ambos equipos");
        return;
    }

    const historial = await getH2H(teamAName, teamBName);
    
    if (!historial.length) {
        alert("No se encontraron partidos entre esos equipos");
        return;
    }

    console.table(historial);
    alert(`Se encontraron ${historial.length} partidos entre ${teamAName} y ${teamBName}. Revisa la consola para más detalles.`);
});

