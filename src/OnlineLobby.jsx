
import React, { useEffect, useState, useCallback } from "react";
import { supabase, signInPlayer } from "./supabase";
import "./App.css";

function shuffle(array) {
  return [...array].sort(() => Math.random() - 0.5);
}

function makeCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

export default function OnlineLobby() {
  const [user, setUser] = useState(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [room, setRoom] = useState(null);
  const [members, setMembers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState("");
  const [roleRevealed, setRoleRevealed] = useState(false);

  const state = room?.game_state || {};
  const players = Array.isArray(state.players) ? state.players : [];
  const phase = state.phase || "lobby";

  const me = members.find(p => p.user_id === user?.id);
  const myPlayer = players.find(p => p.user_id === user?.id);
  const myRole = myPlayer?.role;
  const alive = myPlayer?.alive === true;
  const isHost =
    room?.host_id === user?.id || me?.is_host === true;

  const alivePlayers = players.filter(p => p.alive);
  const myAction = state.nightActions?.[user?.id];
  const myVote = state.votes?.[user?.id];
  const myCheck = state.checkResults?.[user?.id];

  // Авторизация
  useEffect(() => {
    let active = true;

    async function init() {
      try {
        const currentUser = await signInPlayer();
        if (active) setUser(currentUser);
      } catch (error) {
        if (active) setMessage("Ошибка входа: " + error.message);
      }
    }

    init();

    return () => {
      active = false;
    };
  }, []);

  // Загрузка комнаты и участников
  const loadRoom = useCallback(async (roomCode) => {
    if (!roomCode) return null;

    const { data: roomData, error: roomError } = await supabase
      .from("rooms")
      .select("*")
      .eq("code", roomCode)
      .maybeSingle();

    if (roomError) throw roomError;
    if (!roomData) throw new Error("Комната не найдена");

    const { data: people, error: peopleError } = await supabase
      .from("room_members")
      .select("*")
      .eq("room_code", roomCode);

    if (peopleError) throw peopleError;

    setRoom(roomData);
    setMembers(people || []);

    return roomData;
  }, []);

  // Автоматическое обновление и Realtime
  useEffect(() => {
    if (!room?.code) return;

    const roomCode = room.code;
    let active = true;

    const safeLoad = async () => {
      try {
        const { data: roomData, error: roomError } = await supabase
          .from("rooms")
          .select("*")
          .eq("code", roomCode)
          .maybeSingle();

        if (roomError) throw roomError;
        if (!roomData) return;

        const { data: people, error: peopleError } = await supabase
          .from("room_members")
          .select("*")
          .eq("room_code", roomCode);

        if (peopleError) throw peopleError;

        if (active) {
          setRoom(roomData);
          setMembers(people || []);
        }
      } catch (error) {
        if (active) setMessage("Ошибка загрузки: " + error.message);
      }
    };

    const channel = supabase
      .channel("room-" + roomCode)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rooms",
          filter: `code=eq.${roomCode}`,
        },
        safeLoad
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_members",
          filter: `room_code=eq.${roomCode}`,
        },
        safeLoad
      )
      .subscribe();

    const timer = setInterval(safeLoad, 3000);

    return () => {
      active = false;
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [room?.code]);

  // Скрываем роль при переходе в новую фазу
  useEffect(() => {
    setRoleRevealed(false);
    setSelected("");
  }, [room?.code, phase]);

  // Ручное обновление комнаты
  async function refreshRoom() {
    if (!room?.code || refreshing) return;

    setRefreshing(true);
    setMessage("");

    try {
      await loadRoom(room.code);
      setMessage("Комната успешно обновлена!");
    } catch (error) {
      setMessage("Ошибка обновления: " + error.message);
    } finally {
      setRefreshing(false);
    }
  }

  // Создание комнаты
  async function createRoom() {
    if (!user || !name.trim()) {
      setMessage("Сначала введи своё имя");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const roomCode = makeCode();

      const { error: roomError } = await supabase
        .from("rooms")
        .insert({
          code: roomCode,
          host_name: name.trim(),
          host_id: user.id,
          players: [],
          game_state: {
            phase: "lobby",
            players: [],
          },
          status: "waiting",
        });

      if (roomError) throw roomError;

      const { error: memberError } = await supabase
        .from("room_members")
        .insert({
          room_code: roomCode,
          user_id: user.id,
          player_name: name.trim(),
          is_host: true,
        });

      if (memberError) throw memberError;

      setCode(roomCode);
      await loadRoom(roomCode);
      setMessage("Комната создана!");
    } catch (error) {
      setMessage("Ошибка создания: " + error.message);
    } finally {
      setBusy(false);
    }
  }

  // Вход в комнату
  async function joinRoom() {
    if (!user || !name.trim() || !code.trim()) {
      setMessage("Введи имя и код комнаты");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const roomCode = code.trim().toUpperCase();

      const { data: found, error: roomError } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", roomCode)
        .maybeSingle();

      if (roomError) throw roomError;
      if (!found) throw new Error("Комната не найдена");

      const { data: existing, error: existingError } = await supabase
        .from("room_members")
        .select("*")
        .eq("room_code", roomCode)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingError) throw existingError;

      if (!existing) {
        if (found.status !== "waiting") {
          throw new Error("Игра уже началась. Войти нельзя.");
        }

        const { error: insertError } = await supabase
          .from("room_members")
          .insert({
            room_code: roomCode,
            user_id: user.id,
            player_name: name.trim(),
            is_host: false,
          });

        if (insertError) throw insertError;
      }

      setCode(roomCode);
      await loadRoom(roomCode);
      setMessage("Ты вошёл в комнату!");
    } catch (error) {
      setMessage("Ошибка входа: " + error.message);
    } finally {
      setBusy(false);
    }
  }

  // Обновление состояния игры ведущим
  async function updateGame(newState, status = room?.status) {
    if (!room || !isHost) {
      throw new Error("Только ведущий может управлять игрой");
    }

    const { data, error } = await supabase
      .from("rooms")
      .update({
        game_state: newState,
        status,
      })
      .eq("code", room.code)
      .select()
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error(
        "Не удалось обновить игру. Проверь права UPDATE для таблицы rooms в Supabase."
      );
    }

    await loadRoom(room.code);
  }

  // Сохранение ночного действия
  async function savePlayerAction(actionName, targetId) {
    if (!room || !user || !myPlayer) {
      throw new Error("Не удалось определить твоего игрока");
    }

    const { data: freshRoom, error: readError } = await supabase
      .from("rooms")
      .select("game_state")
      .eq("code", room.code)
      .maybeSingle();

    if (readError) throw readError;
    if (!freshRoom) throw new Error("Комната не найдена");

    const freshState = freshRoom.game_state || {};

    if (freshState.phase !== "night") {
      throw new Error("Сейчас уже не ночь. Обнови комнату.");
    }

    const actions = {
      ...(freshState.nightActions || {}),
      [user.id]: {
        type: actionName,
        target: targetId,
      },
    };

    const { data, error } = await supabase
      .from("rooms")
      .update({
        game_state: {
          ...freshState,
          nightActions: actions,
        },
      })
      .eq("code", room.code)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("Выбор не сохранён. Проверь права UPDATE.");

    await loadRoom(room.code);
  }

  // Начало игры
  async function startGame() {
    if (!isHost) {
      setMessage("Начать игру может только ведущий");
      return;
    }

    if (members.length < 4) {
      setMessage("Для игры нужно минимум 4 игрока");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const shuffled = shuffle(members);
      const mafiaCount = Math.max(1, Math.floor(members.length / 4));

      const gamePlayers = shuffled.map((player, index) => ({
        user_id: player.user_id,
        name: player.player_name,
        role:
          index < mafiaCount
            ? "Мафия"
            : index === mafiaCount
            ? "Комиссар"
            : index === mafiaCount + 1
            ? "Доктор"
            : "Мирный",
        alive: true,
      }));

      await updateGame(
        {
          phase: "night",
          round: 1,
          players: gamePlayers,
          nightActions: {},
          votes: {},
          checkResults: {},
          result: "Первая ночь началась.",
          winner: "",
        },
        "playing"
      );

      setRoleRevealed(false);
      setSelected("");
      setMessage("Игра началась! Открой свою роль.");
    } catch (error) {
      setMessage("Ошибка начала игры: " + error.message);
    } finally {
      setBusy(false);
    }
  }

  // Ночное действие
  async function nightAction() {
    if (phase !== "night") {
      setMessage("Сейчас не ночь");
      return;
    }

    if (!myPlayer || !alive) {
      setMessage("Ты не можешь выполнять ночные действия");
      return;
    }

    if (!selected) {
      setMessage("Сначала выбери игрока");
      return;
    }

    const target = players.find(p => p.user_id === selected);

    if (!target || !target.alive) {
      setMessage("Этот игрок уже выбыл");
      return;
    }

    if (myRole === "Мафия" && target.role === "Мафия") {
      setMessage("Нельзя выбрать другого участника мафии");
      return;
    }

    if (
      (myRole === "Комиссар" || myRole === "Мафия") &&
      target.user_id === user.id
    ) {
      setMessage("Нельзя выбрать себя");
      return;
    }

    const actionType = {
      "Мафия": "kill",
      "Комиссар": "check",
      "Доктор": "save",
    }[myRole];

    if (!actionType) {
      setMessage("У мирного жителя нет ночного действия");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      await savePlayerAction(actionType, selected);
      setMessage("Твой выбор успешно сохранён!");
      setSelected("");
    } catch (error) {
      setMessage("Ошибка выбора: " + error.message);
    } finally {
      setBusy(false);
    }
  }

  // Завершение ночи ведущим
  async function resolveNight() {
    if (!isHost || phase !== "night") return;

    const actions = state.nightActions || {};
    const mafiaVotes = {};

    players
      .filter(p => p.alive && p.role === "Мафия")
      .forEach(p => {
        const action = actions[p.user_id];

        if (action?.type === "kill" && action.target) {
          mafiaVotes[action.target] =
            (mafiaVotes[action.target] || 0) + 1;
        }
      });

    const sorted = Object.entries(mafiaVotes)
      .sort((a, b) => b[1] - a[1]);

    let target = null;

    if (
      sorted.length &&
      (sorted.length === 1 || sorted[0][1] > sorted[1][1])
    ) {
      target = sorted[0][0];
    }

    const doctor = players.find(
      p => p.alive && p.role === "Доктор"
    );

    const commissioner = players.find(
      p => p.alive && p.role === "Комиссар"
    );

    const saved = doctor
      ? actions[doctor.user_id]?.type === "save"
        ? actions[doctor.user_id].target
        : null
      : null;

    const checkTarget = commissioner
      ? actions[commissioner.user_id]?.type === "check"
        ? actions[commissioner.user_id].target
        : null
      : null;

    let updatedPlayers = players.map(p => ({ ...p }));
    let result = "Ночь прошла спокойно.";

    if (target && target !== saved) {
      const victim = updatedPlayers.find(p => p.user_id === target);

      if (victim?.alive) {
        updatedPlayers = updatedPlayers.map(p =>
          p.user_id === target ? { ...p, alive: false } : p
        );

        result = `Ночью выбыл игрок: ${victim.name}.`;
      }
    } else if (target && target === saved) {
      result = "Доктор спас выбранного игрока!";
    } else if (sorted.length > 1) {
      result = "Мафия не смогла договориться о выборе.";
    }

    const checkResults = { ...(state.checkResults || {}) };

    if (checkTarget && commissioner) {
      const checked = players.find(p => p.user_id === checkTarget);

      if (checked) {
        checkResults[commissioner.user_id] =
          checked.role === "Мафия"
            ? `${checked.name} — мафия`
            : `${checked.name} — не мафия`;
      }
    }

    const aliveNow = updatedPlayers.filter(p => p.alive);
    const mafiaCount = aliveNow.filter(p => p.role === "Мафия").length;
    const townCount = aliveNow.length - mafiaCount;

    const winner =
      mafiaCount === 0
        ? "Мирные жители"
        : mafiaCount >= townCount
        ? "Мафия"
        : "";

    setBusy(true);

    try {
      await updateGame(
        {
          ...state,
          players: updatedPlayers,
          phase: winner ? "finished" : "day",
          nightActions: {},
          votes: {},
          checkResults,
          result,
          winner,
        },
        winner ? "finished" : "playing"
      );

      setSelected("");
      setMessage("Наступил новый день!");
    } catch (error) {
      setMessage("Ошибка завершения ночи: " + error.message);
    } finally {
      setBusy(false);
    }
  }

  // Дневное голосование
  async function vote() {
    if (phase !== "day") return;

    if (!myPlayer || !alive) {
      setMessage("Выбывшие игроки не голосуют");
      return;
    }

    if (!selected) {
      setMessage("Сначала выбери игрока");
      return;
    }

    const target = players.find(p => p.user_id === selected);

    if (!target?.alive || target.user_id === user.id) {
      setMessage("Выбери другого живого игрока");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const { data: freshRoom, error: readError } = await supabase
        .from("rooms")
        .select("game_state")
        .eq("code", room.code)
        .maybeSingle();

      if (readError) throw readError;
      if (!freshRoom) throw new Error("Комната не найдена");

      const freshState = freshRoom.game_state || {};
      const votes = { ...(freshState.votes || {}) };

      if (votes[user.id]) {
        setMessage("Ты уже проголосовал в этом раунде");
        return;
      }

      votes[user.id] = selected;

      const { data, error } = await supabase
        .from("rooms")
        .update({
          game_state: {
            ...freshState,
            votes,
          },
        })
        .eq("code", room.code)
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("Голос не сохранён. Проверь права UPDATE.");

      await loadRoom(room.code);
      setMessage("Твой голос принят!");
      setSelected("");
    } catch (error) {
      setMessage("Ошибка голосования: " + error.message);
    } finally {
      setBusy(false);
    }
  }

  // Подсчёт голосов ведущим
  async function resolveVotes() {
    if (!isHost || phase !== "day") return;

    const votes = state.votes || {};
    const counts = {};

    Object.entries(votes).forEach(([voterId, targetId]) => {
      const voter = players.find(p => p.user_id === voterId);
      const target = players.find(p => p.user_id === targetId);

      if (voter?.alive && target?.alive) {
        counts[targetId] = (counts[targetId] || 0) + 1;
      }
    });

    const sorted = Object.entries(counts)
      .sort((a, b) => b[1] - a[1]);

    let updatedPlayers = players.map(p => ({ ...p }));
    let result = "Голосование завершилось ничьей.";

    if (
      sorted.length &&
      (sorted.length === 1 || sorted[0][1] > sorted[1][1])
    ) {
      const targetId = sorted[0][0];
      const victim = updatedPlayers.find(p => p.user_id === targetId);

      if (victim?.alive) {
        updatedPlayers = updatedPlayers.map(p =>
          p.user_id === targetId ? { ...p, alive: false } : p
        );

        result = `По итогам голосования выбыл игрок: ${victim.name}.`;
      }
    }

    const aliveNow = updatedPlayers.filter(p => p.alive);
    const mafiaCount = aliveNow.filter(p => p.role === "Мафия").length;
    const townCount = aliveNow.length - mafiaCount;

    const winner =
      mafiaCount === 0
        ? "Мирные жители"
        : mafiaCount >= townCount
        ? "Мафия"
        : "";

    setBusy(true);

    try {
      await updateGame(
        {
          ...state,
          players: updatedPlayers,
          phase: winner ? "finished" : "night",
          round: (state.round || 1) + 1,
          nightActions: {},
          votes: {},
          result,
          winner,
        },
        winner ? "finished" : "playing"
      );

      setSelected("");
      setMessage(winner ? "Игра завершена!" : "Наступила ночь!");
    } catch (error) {
      setMessage("Ошибка голосования: " + error.message);
    } finally {
      setBusy(false);
    }
  }

  // Выход из комнаты
  async function leaveRoom() {
    if (!room || !user) return;

    setBusy(true);

    try {
      const { error } = await supabase
        .from("room_members")
        .delete()
        .eq("room_code", room.code)
        .eq("user_id", user.id);

      if (error) throw error;

      setRoom(null);
      setMembers([]);
      setSelected("");
      setRoleRevealed(false);
      setMessage("Ты вышел из комнаты");
    } catch (error) {
      setMessage("Ошибка выхода: " + error.message);
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!room?.code) return;

    try {
      await navigator.clipboard.writeText(room.code);
      setMessage("Код комнаты скопирован!");
    } catch {
      setMessage("Не удалось скопировать. Код комнаты: " + room.code);
    }
  }

  // Экран подключения
  if (!user) {
    return (
      <main className="mafia-app">
        <h1>MAFIA NIGHT</h1>
        <p>Подключение...</p>
        {message && <p>{message}</p>}
      </main>
    );
  }

  // Создание или вход
  if (!room) {
    return (
      <main className="mafia-app">
        <h1>MAFIA NIGHT</h1>
        <p>Создай комнату или войди по коду</p>

        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Твоё имя"
        />

        <button disabled={busy} onClick={createRoom}>
          {busy ? "Подожди..." : "Создать комнату"}
        </button>

        <input
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          placeholder="Код комнаты"
        />

        <button disabled={busy} onClick={joinRoom}>
          {busy ? "Входим..." : "Войти в комнату"}
        </button>

        {message && <p>{message}</p>}
      </main>
    );
  }

  // Основной экран
  return (
    <main className="mafia-app">
      <h1>MAFIA NIGHT</h1>

      <h2>Комната: {room.code}</h2>

      <button onClick={copyCode}>
        📋 Скопировать код
      </button>

      <button disabled={refreshing} onClick={refreshRoom}>
        {refreshing ? "Обновляем..." : "🔄 ОБНОВИТЬ КОМНАТУ"}
      </button>

      {message && <p>{message}</p>}

      {phase === "lobby" && (
        <>
          <h2>Ожидание игроков</h2>
          <p>Игроков в комнате: {members.length}</p>

          {members.map(player => (
            <p key={player.user_id}>
              {player.player_name}
              {player.is_host ? " 👑 Ведущий" : ""}
              {player.user_id === user.id ? " (Ты)" : ""}
            </p>
          ))}

          {isHost && (
            <button
              disabled={busy || members.length < 4}
              onClick={startGame}
            >
              {busy ? "Запускаем..." : "Начать игру"}
            </button>
          )}

          {members.length < 4 && (
            <p>Для начала игры нужно минимум 4 игрока.</p>
          )}
        </>
      )}

      {phase !== "lobby" && (
        <>
          {!myPlayer ? (
            <section>
              <h2>Загружаем твою роль...</h2>
              <p>Нажми обновить комнату.</p>
            </section>
          ) : !roleRevealed ? (
            <section>
              <h2>🎭 ИГРА НАЧАЛАСЬ</h2>
              <p>Нажми, чтобы узнать свою роль. Не показывай экран другим.</p>

              <button onClick={() => setRoleRevealed(true)}>
                ПОКАЗАТЬ МОЮ РОЛЬ
              </button>
            </section>
          ) : (
            <>
              <section>
                <h2>🎭 ТВОЯ РОЛЬ: {myRole}</h2>
                <p>{alive ? "Ты в игре" : "Ты выбыл из игры"}</p>
                <p>Раунд: {state.round || 1}</p>
                <p>
                  {myRole === "Мафия" && "Твоя задача — действовать вместе с мафией."}
                  {myRole === "Комиссар" && "Ночью ты можешь проверить одного игрока."}
                  {myRole === "Доктор" && "Ночью ты можешь спасти одного игрока."}
                  {myRole === "Мирный" && "Обсуждай и участвуй в дневном голосовании."}
                </p>
              </section>

              <h2>
                {phase === "night"
                  ? "🌙 НОЧЬ"
                  : phase === "day"
                  ? "☀️ ДЕНЬ"
                  : "🏆 ИГРА ОКОНЧЕНА"}
              </h2>

              {phase === "night" && alive && (
                <section>
                  <h2>🌙 Ночные действия</h2>

                  {myRole === "Мафия" && (
                    <p>Выбери игрока для ночного голосования.</p>
                  )}

                  {myRole === "Комиссар" && (
                    <p>Выбери игрока для проверки.</p>
                  )}

                  {myRole === "Доктор" && (
                    <p>Выбери игрока, которого хочешь спасти.</p>
                  )}

                  {myRole === "Мирный" && (
                    <p>Ты мирный житель. Жди наступления дня.</p>
                  )}

                  {["Мафия", "Комиссар", "Доктор"].includes(myRole) &&
                    alivePlayers
                      .filter(player => {
                        if (myRole === "Доктор") return true;
                        if (player.user_id === user.id) return false;
                        if (
                          myRole === "Мафия" &&
                          player.role === "Мафия"
                        ) return false;
                        return true;
                      })
                      .map(player => (
                        <button
                          key={player.user_id}
                          className={selected === player.user_id ? "selected" : ""}
                          onClick={() => setSelected(player.user_id)}
                        >
                          {selected === player.user_id ? "✓ " : ""}
                          {player.name}
                          {player.user_id === user.id ? " (Ты)" : ""}
                        </button>
                      ))}

                  {["Мафия", "Комиссар", "Доктор"].includes(myRole) && (
                    <button
                      disabled={!selected || busy}
                      onClick={nightAction}
                    >
                      {busy ? "Сохраняем..." : "Подтвердить выбор"}
                    </button>
                  )}

                  {myAction && (
                    <p>Твой ночной выбор сохранён.</p>
                  )}

                  {myRole === "Комиссар" && myCheck && (
                    <h3>🔎 Результат проверки: {myCheck}</h3>
                  )}

                  {isHost && (
                    <button disabled={busy} onClick={resolveNight}>
                      Завершить ночь и открыть день
                    </button>
                  )}
                </section>
              )}

              {phase === "night" && !alive && (
                <p>Ты выбыл. Дождись окончания игры.</p>
              )}

              {phase === "day" && (
                <section>
                  <h2>☀️ Дневное голосование</h2>

                  {alive ? (
                    <>
                      <p>Выбери игрока, за которого голосуешь.</p>

                      {alivePlayers
                        .filter(player => player.user_id !== user.id)
                        .map(player => (
                          <button
                            key={player.user_id}
                            className={selected === player.user_id ? "selected" : ""}
                            onClick={() => setSelected(player.user_id)}
                          >
                            {selected === player.user_id ? "✓ " : ""}
                            {player.name}
                          </button>
                        ))}

                      <button
                        disabled={!selected || Boolean(myVote) || busy}
                        onClick={vote}
                      >
                        {myVote ? "Ты уже проголосовал" : "Отдать голос"}
                      </button>
                    </>
                  ) : (
                    <p>Ты выбыл и больше не можешь голосовать.</p>
                  )}

                  <p>
                    Проголосовало: {Object.keys(state.votes || {}).length}
                    {" / "}{alivePlayers.length}
                  </p>

                  {isHost && (
                    <button disabled={busy} onClick={resolveVotes}>
                      Завершить голосование
                    </button>
                  )}
                </section>
              )}

              <section>
                <h2>Игроки</h2>

                {players.map(player => (
                  <p key={player.user_id}>
                    {player.alive ? "🟢" : "⚫"} {player.name}
                    {player.user_id === user.id ? " (Ты)" : ""}
                    {!player.alive ? " — выбыл" : ""}
                  </p>
                ))}
              </section>

              {state.result && <h3>{state.result}</h3>}

              {phase === "finished" && (
                <section>
                  <h1>🏆 Победили: {state.winner}!</h1>
                  <p>Игра завершена.</p>
                </section>
              )}
            </>
          )}
        </>
      )}

      <button disabled={busy} onClick={leaveRoom}>
        Выйти из комнаты
      </button>
    </main>
  );
}

