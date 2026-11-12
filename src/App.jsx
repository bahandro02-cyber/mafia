
import React, { useState } from "react";
import "./App.css";

export default function App() {
  const [players, setPlayers] = useState([]);
  const [name, setName] = useState("");
  const [mafiaCount, setMafiaCount] = useState(1);

  const [phase, setPhase] = useState("setup");
  const [roles, setRoles] = useState([]);
  const [revealIndex, setRevealIndex] = useState(0);
  const [showRole, setShowRole] = useState(false);

  const [nightActorIndex, setNightActorIndex] = useState(0);
  const [nightActions, setNightActions] = useState({});
  const [privateInfo, setPrivateInfo] = useState("");
  const [selectedTarget, setSelectedTarget] = useState("");

  const [votes, setVotes] = useState([]);
  const [voteIndex, setVoteIndex] = useState(0);
  const [winner, setWinner] = useState("");

  // Добавление игроков
  const addPlayer = () => {
    const cleanName = name.trim();

    if (!cleanName) return;

    if (
      players.some(
        (player) =>
          player.name.toLowerCase() === cleanName.toLowerCase()
      )
    ) {
      alert("Такое имя уже есть!");
      return;
    }

    setPlayers([
      ...players,
      { name: cleanName, role: "", alive: true },
    ]);

    setName("");
  };

  // Удаление игроков
  const removePlayer = (index) => {
    setPlayers(players.filter((_, i) => i !== index));
  };

  // Проверка победителя
  const checkWinner = (list) => {
    const mafiaAlive = list.filter(
      (p) => p.alive && p.role === "МАФИЯ"
    ).length;

    const townAlive = list.filter(
      (p) => p.alive && p.role !== "МАФИЯ"
    ).length;

    if (mafiaAlive === 0) return "МИРНЫЕ ЖИТЕЛИ";
    if (mafiaAlive >= townAlive) return "МАФИЯ";

    return "";
  };

  // Начало игры
  const startGame = () => {
    if (players.length < 4) return;

    if (mafiaCount > players.length - 3) {
      alert("Недостаточно игроков для такого количества мафии!");
      return;
    }

    let newRoles = [
      ...Array(mafiaCount).fill("МАФИЯ"),
      "ДОКТОР",
      "КОМИССАР",
      ...Array(players.length - mafiaCount - 2).fill(
        "МИРНЫЙ ЖИТЕЛЬ"
      ),
    ];

    // Перемешиваем роли
    for (let i = newRoles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newRoles[i], newRoles[j]] = [
        newRoles[j],
        newRoles[i],
      ];
    }

    const newPlayers = players.map((player, index) => ({
      ...player,
      role: newRoles[index],
      alive: true,
    }));

    setPlayers(newPlayers);
    setRoles(newRoles);
    setRevealIndex(0);
    setShowRole(false);
    setPhase("roles");
  };

  // Начало ночи
  const startNight = () => {
    setNightActions({});
    setNightActorIndex(0);
    setPrivateInfo("");
    setSelectedTarget("");
    setPhase("night");
  };

  // Игроки, которые выполняют ночные действия
  const nightActors = [
    players.findIndex(
      (p) => p.alive && p.role === "МАФИЯ"
    ),
    players.findIndex(
      (p) => p.alive && p.role === "ДОКТОР"
    ),
    players.findIndex(
      (p) => p.alive && p.role === "КОМИССАР"
    ),
  ].filter((index) => index !== -1);

  const currentActor = nightActors[nightActorIndex];

  // Ночное действие
  const submitNightAction = () => {
    if (selectedTarget === "") return;

    const target = Number(selectedTarget);
    const actor = players[currentActor];

    setNightActions((previous) => ({
      ...previous,
      [actor.role]: target,
    }));

    if (actor.role === "КОМИССАР") {
      const checkedPlayer = players[target];

      setPrivateInfo(
        checkedPlayer.role === "МАФИЯ"
          ? "🔴 Этот игрок — МАФИЯ!"
          : "🟢 Этот игрок не мафия."
      );
    } else {
      setPrivateInfo("Действие принято. Передай телефон дальше.");
    }
  };

  // Следующий ночной игрок
  const continueNight = () => {
    setPrivateInfo("");
    setSelectedTarget("");

    if (nightActorIndex < nightActors.length - 1) {
      setNightActorIndex(nightActorIndex + 1);
      return;
    }

    // Завершение ночи
    const victim = nightActions["МАФИЯ"];
    const saved = nightActions["ДОКТОР"];

    let updatedPlayers = players.map((player, index) => {
      if (
        victim !== undefined &&
        victim !== saved &&
        index === victim
      ) {
        return { ...player, alive: false };
      }

      return player;
    });

    setPlayers(updatedPlayers);

    const gameWinner = checkWinner(updatedPlayers);

    if (gameWinner) {
      setWinner(gameWinner);
      setPhase("result");
    } else {
      setVotes([]);
      setVoteIndex(0);
      setSelectedTarget("");
      setPhase("day");
    }
  };

  // Игроки, которые ещё живы
  const aliveIndices = players
    .map((player, index) => player.alive ? index : -1)
    .filter((index) => index !== -1);

  // Голосование
  const submitVote = () => {
    if (selectedTarget === "") return;

    const voter = aliveIndices[voteIndex];
    const target = Number(selectedTarget);

    const newVotes = [
      ...votes,
      { voter, target },
    ];

    setVotes(newVotes);
    setSelectedTarget("");

    if (voteIndex < aliveIndices.length - 1) {
      setVoteIndex(voteIndex + 1);
      return;
    }

    // Подсчёт голосов
    const counts = {};

    newVotes.forEach((vote) => {
      counts[vote.target] = (counts[vote.target] || 0) + 1;
    });

    const maxVotes = Math.max(...Object.values(counts));
    const mostVoted = Object.keys(counts).filter(
      (index) => counts[index] === maxVotes
    );

    let updatedPlayers = players;

    if (mostVoted.length === 1) {
      const eliminated = Number(mostVoted[0]);

      updatedPlayers = players.map((player, index) =>
        index === eliminated
          ? { ...player, alive: false }
          : player
      );
    }

    setPlayers(updatedPlayers);

    const gameWinner = checkWinner(updatedPlayers);

    if (gameWinner) {
      setWinner(gameWinner);
      setPhase("result");
    } else {
      setPhase("dayResult");
    }
  };

  // Новая игра
  const restartGame = () => {
    setPlayers([]);
    setName("");
    setMafiaCount(1);
    setRoles([]);
    setVotes([]);
    setWinner("");
    setPhase("setup");
  };

  return (
    <div className="app">
      <div className="game-card">

        {/* РЕГИСТРАЦИЯ */}
        {phase === "setup" && (
          <>
            <h1>🔴 MAFIA NIGHT</h1>
            <p className="subtitle">ИГРА ДЛЯ КОМПАНИИ</p>

            <h2>Добавить игроков</h2>

            <div className="input-box">
              <input
                value={name}
                placeholder="Имя игрока"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && addPlayer()
                }
              />
              <button onClick={addPlayer}>+</button>
            </div>

            <h3>Игроки: {players.length}</h3>

            {players.map((player, index) => (
              <div className="player" key={index}>
                <span>{index + 1}. {player.name}</span>
                <button onClick={() => removePlayer(index)}>
                  ✕
                </button>
              </div>
            ))}

            <label>Количество мафии</label>

            <select
              value={mafiaCount}
              onChange={(e) =>
                setMafiaCount(Number(e.target.value))
              }
            >
              {Array.from(
                { length: Math.max(1, players.length - 2) },
                (_, i) => i + 1
              ).map((count) => (
                <option key={count} value={count}>
                  {count} мафия
                </option>
              ))}
            </select>

            <button
              className="start"
              disabled={
                players.length < 4 ||
                mafiaCount > players.length - 3
              }
              onClick={startGame}
            >
              НАЧАТЬ ИГРУ
            </button>
          </>
        )}

        {/* РАЗДАЧА РОЛЕЙ */}
        {phase === "roles" && (
          <>
            <h1>🎭 ТВОЯ РОЛЬ</h1>

            <p className="subtitle">
              Игрок {revealIndex + 1} из {players.length}
            </p>

            <h2>{players[revealIndex].name}</h2>

            {!showRole ? (
              <>
                <p className="hint">
                  Убедись, что остальные не смотрят на экран.
                </p>

                <button
                  className="start"
                  onClick={() => setShowRole(true)}
                >
                  ПОКАЗАТЬ МОЮ РОЛЬ
                </button>
              </>
            ) : (
              <>
                <div className="role">
                  <h2>
                    {players[revealIndex].role === "МАФИЯ"
                      ? "🔴 МАФИЯ"
                      : players[revealIndex].role === "ДОКТОР"
                      ? "🩺 ДОКТОР"
                      : players[revealIndex].role === "КОМИССАР"
                      ? "🔎 КОМИССАР"
                      : "👤 МИРНЫЙ ЖИТЕЛЬ"}
                  </h2>
                </div>

                <p className="hint">
                  Запомни свою роль и не показывай её другим.
                </p>

                <button
                  className="start"
                  onClick={() => {
                    if (revealIndex < players.length - 1) {
                      setRevealIndex(revealIndex + 1);
                      setShowRole(false);
                    } else {
                      startNight();
                    }
                  }}
                >
                  {revealIndex === players.length - 1
                    ? "НАЧАТЬ НОЧЬ"
                    : "СКРЫТЬ И ПЕРЕДАТЬ ТЕЛЕФОН"}
                </button>
              </>
            )}
          </>
        )}

        {/* НОЧЬ */}
        {phase === "night" && (
          <>
            <h1>🌙 НОЧЬ</h1>
            <p className="subtitle">
              Город засыпает...
            </p>

            {privateInfo ? (
              <>
                <div className="role">
                  <h2>{privateInfo}</h2>
                </div>

                <button
                  className="start"
                  onClick={continueNight}
                >
                  СКРЫТЬ И ПРОДОЛЖИТЬ
                </button>
              </>
            ) : (
              <>
                <h2>
                  {players[currentActor].role === "МАФИЯ"
                    ? "🔴 Мафия просыпается"
                    : players[currentActor].role === "ДОКТОР"
                    ? "🩺 Доктор просыпается"
                    : "🔎 Комиссар просыпается"}
                </h2>

                <p className="hint">
                  Передай телефон: {players[currentActor].name}
                </p>

                <label>
                  {players[currentActor].role === "МАФИЯ"
                    ? "Кого выбрать?"
                    : players[currentActor].role === "ДОКТОР"
                    ? "Кого защитить?"
                    : "Кого проверить?"}
                </label>

                <select
                  value={selectedTarget}
                  onChange={(e) =>
                    setSelectedTarget(e.target.value)
                  }
                >
                  <option value="">Выбери игрока</option>

                  {players.map((player, index) => {
                    const actorRole = players[currentActor].role;

                    const canChoose =
                      player.alive &&
                      index !== currentActor &&
                      (actorRole !== "МАФИЯ" ||
                        player.role !== "МАФИЯ");

                    return canChoose ? (
                      <option key={index} value={index}>
                        {player.name}
                      </option>
                    ) : null;
                  })}
                </select>

                <button
                  className="start"
                  disabled={selectedTarget === ""}
                  onClick={submitNightAction}
                >
                  ПОДТВЕРДИТЬ
                </button>
              </>
            )}
          </>
        )}

        {/* ДЕНЬ */}
        {phase === "day" && (
          <>
            <h1>☀️ ГОРОД ПРОСЫПАЕТСЯ</h1>

            <p className="subtitle">
              Обсудите, кто может быть мафией.
            </p>

            <div className="players">
              {players.map((player, index) => (
                <div className="player" key={index}>
                  <span>{player.name}</span>
                  <span>
                    {player.alive ? "🟢 Жив" : "⚫ Выбыл"}
                  </span>
                </div>
              ))}
            </div>

            <button
              className="start"
              onClick={() => {
                setVoteIndex(0);
                setVotes([]);
                setSelectedTarget("");
                setPhase("voting");
              }}
            >
              ПЕРЕЙТИ К ГОЛОСОВАНИЮ
            </button>
          </>
        )}

        {/* ГОЛОСОВАНИЕ */}
        {phase === "voting" && (
          <>
            <h1>🗳️ ГОЛОСОВАНИЕ</h1>

            <p className="subtitle">
              Голосует: {players[aliveIndices[voteIndex]].name}
            </p>

            <label>Кого исключаем из игры?</label>

            <select
              value={selectedTarget}
              onChange={(e) =>
                setSelectedTarget(e.target.value)
              }
            >
              <option value="">Выбери игрока</option>

              {players.map((player, index) => (
                player.alive &&
                index !== aliveIndices[voteIndex] ? (
                  <option key={index} value={index}>
                    {player.name}
                  </option>
                ) : null
              ))}
            </select>

            <p className="hint">
              Голос тайный. Не показывай выбор другим.
            </p>

            <button
              className="start"
              disabled={selectedTarget === ""}
              onClick={submitVote}
            >
              ПОДТВЕРДИТЬ ГОЛОС
            </button>
          </>
        )}

        {/* РЕЗУЛЬТАТ ГОЛОСОВАНИЯ */}
        {phase === "dayResult" && (
          <>
            <h1>📢 ИТОГИ ДНЯ</h1>

            {(() => {
              const eliminated = players.find(
                (p, index) =>
                  !p.alive &&
                  votes.some((v) => v.target === index)
              );

              const counts = {};
              votes.forEach((v) => {
                counts[v.target] = (counts[v.target] || 0) + 1;
              });

              const max = Math.max(...Object.values(counts));
              const top = Object.keys(counts).filter(
                (key) => counts[key] === max
              );

              return top.length > 1 ? (
                <div className="role">
                  <h2>🤝 Ничья!</h2>
                  <p>Никто не выбывает.</p>
                </div>
              ) : (
                <div className="role">
                  <h2>🚪 Игрок выбыл</h2>
                  <h3>{players[Number(top[0])].name}</h3>
                  <p>
                    Его роль: {players[Number(top[0])].role}
                  </p>
                </div>
              );
            })()}

            <button className="start" onClick={startNight}>
              НАСТУПАЕТ НОЧЬ
            </button>
          </>
        )}

        {/* ПОБЕДА */}
        {phase === "result" && (
          <>
            <h1>🏆 ПОБЕДА!</h1>

            <div className="role">
              <h2>{winner}</h2>
              <p>Поздравляем с победой!</p>
            </div>

            <h3>Роли игроков</h3>

            {players.map((player, index) => (
              <div className="player" key={index}>
                <span>{player.name}</span>
                <span>{player.role}</span>
              </div>
            ))}

            <button className="start" onClick={restartGame}>
              НОВАЯ ИГРА
            </button>
          </>
        )}

      </div>
    </div>
  );
}
