
import React, { useEffect, useState } from "react";
import { supabase, signInPlayer } from "./supabase";
import "./App.css";

export default function OnlineLobby() {
  const [user, setUser] = useState(null);
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [message, setMessage] = useState("Подключаемся...");
  const [loading, setLoading] = useState(false);
  const [showRole, setShowRole] = useState(false);

  const isHost = room && user && room.host_id === user.id;
  const myPlayer = players.find((p) => p.id === user?.id);

  useEffect(() => {
    signInPlayer()
      .then((u) => {
        setUser(u);
        setMessage("Введи имя и создай комнату или войди по коду.");
      })
      .catch((err) => {
        console.error(err);
        setMessage("Ошибка авторизации: " + err.message);
      });
  }, []);

  useEffect(() => {
    if (!room?.code) return;

    const channel = supabase
      .channel("mafia-room-" + room.code)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rooms",
          filter: `code=eq.${room.code}`,
        },
        (payload) => {
          if (payload.new) {
            setRoom(payload.new);
            setPlayers(
              Array.isArray(payload.new.players)
                ? payload.new.players
                : []
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room?.code]);

  async function createRoom() {
    if (!user) return setMessage("Подожди авторизации.");
    if (!name.trim()) return setMessage("Введи своё имя.");

    setLoading(true);
    setMessage("Создаём комнату...");

    try {
      const code = Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();

      const firstPlayer = {
        id: user.id,
        name: name.trim(),
        alive: true,
        ready: true,
      };

      const { data, error } = await supabase
        .from("rooms")
        .insert({
          code,
          host_id: user.id,
          host_name: name.trim(),
          players: [firstPlayer],
          game_state: {},
          status: "waiting",
        })
        .select()
        .single();

      if (error) throw error;

      const { error: memberError } = await supabase
        .from("room_members")
        .insert({
          room_code: code,
          user_id: user.id,
          player_name: name.trim(),
          is_host: true,
        });

      if (memberError) throw memberError;

      setRoom(data);
      setPlayers([firstPlayer]);
      setMessage("Комната создана! Отправь код друзьям.");
    } catch (err) {
      console.error(err);
      setMessage("Ошибка создания: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function joinRoom() {
    if (!user) return setMessage("Подожди авторизации.");
    if (!name.trim()) return setMessage("Введи своё имя.");

    const code = joinCode.trim().toUpperCase();

    if (!code) return setMessage("Введи код комнаты.");

    setLoading(true);
    setMessage("Ищем комнату...");

    try {
      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", code)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("Комната не найдена. Проверь код.");
      if (data.status !== "waiting") {
        throw new Error("Игра уже началась.");
      }

      const currentPlayers = Array.isArray(data.players)
        ? data.players
        : [];

      if (currentPlayers.some((p) => p.id === user.id)) {
        setRoom(data);
        setPlayers(currentPlayers);
        setMessage("Ты уже находишься в этой комнате.");
        return;
      }

      if (
        currentPlayers.some(
          (p) => p.name.toLowerCase() === name.trim().toLowerCase()
        )
      ) {
        throw new Error("Это имя уже занято.");
      }

      const newPlayer = {
        id: user.id,
        name: name.trim(),
        alive: true,
        ready: true,
      };

      const { error: memberError } = await supabase
        .from("room_members")
        .insert({
          room_code: code,
          user_id: user.id,
          player_name: name.trim(),
          is_host: false,
        });

      if (memberError) throw memberError;

      const updatedPlayers = [...currentPlayers, newPlayer];

      const { data: updatedRoom, error: updateError } = await supabase
        .from("rooms")
        .update({ players: updatedPlayers })
        .eq("code", code)
        .select()
        .single();

      if (updateError) throw updateError;

      setRoom(updatedRoom);
      setPlayers(updatedPlayers);
      setMessage("Ты успешно вошёл в комнату!");
    } catch (err) {
      console.error(err);
      setMessage("Ошибка входа: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function refreshRoom() {
    if (!room) return;

    const { data, error } = await supabase
      .from("rooms")
      .select("*")
      .eq("code", room.code)
      .single();

    if (error) {
      setMessage("Ошибка обновления: " + error.message);
      return;
    }

    setRoom(data);
    setPlayers(Array.isArray(data.players) ? data.players : []);
  }

  async function startGame() {
    if (!isHost) return setMessage("Начать игру может только создатель комнаты.");
    if (players.length < 4) {
      return setMessage("Для начала игры нужно минимум 4 игрока.");
    }

    setLoading(true);

    try {
      const roles = [
        "МАФИЯ",
        "ДОКТОР",
        "КОМИССАР",
        ...Array(players.length - 3).fill("МИРНЫЙ ЖИТЕЛЬ"),
      ];

      for (let i = roles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [roles[i], roles[j]] = [roles[j], roles[i]];
      }

      const gamePlayers = players.map((player, index) => ({
        ...player,
        role: roles[index],
        alive: true,
      }));

      const { data, error } = await supabase
        .from("rooms")
        .update({
          players: gamePlayers,
          status: "playing",
          game_state: {
            phase: "roles",
            started: true,
          },
        })
        .eq("code", room.code)
        .select()
        .single();

      if (error) throw error;

      setRoom(data);
      setPlayers(gamePlayers);
      setShowRole(false);
      setMessage("Игра началась!");
    } catch (err) {
      console.error(err);
      setMessage("Ошибка запуска: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!user) {
    return (
      <main className="app">
        <div className="game-card">
          <h1>🔴 MAFIA NIGHT</h1>
          <p>{message}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="app">
      <div className="game-card">
        <h1>🔴 MAFIA NIGHT</h1>
        <p className="subtitle">ОНЛАЙН-ИГРА</p>

        {!room ? (
          <div className="online-box">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Твоё имя"
              maxLength={20}
            />

            <button
              className="start"
              onClick={createRoom}
              disabled={loading}
            >
              {loading ? "ПОДОЖДИ..." : "СОЗДАТЬ КОМНАТУ"}
            </button>

            <h3>Или войти по коду</h3>

            <input
              value={joinCode}
              onChange={(e) =>
                setJoinCode(e.target.value.toUpperCase())
              }
              placeholder="КОД КОМНАТЫ"
              maxLength={6}
            />

            <button
              className="start"
              onClick={joinRoom}
              disabled={loading}
            >
              {loading ? "ПОДОЖДИ..." : "ВОЙТИ В КОМНАТУ"}
            </button>
          </div>
        ) : (
          <>
            <div className="role">
              <h2>КОМНАТА: {room.code}</h2>
              <h3>Игроков: {players.length}</h3>
              <p>Статус: {room.status === "waiting" ? "Ожидание" : "Игра идёт"}</p>
            </div>

            <h3>Список игроков</h3>

            {players.map((player, index) => (
              <div className="player" key={player.id}>
                <span>
                  {index + 1}. {player.name}
                  {player.id === room.host_id ? " 👑" : ""}
                </span>
                <span>{player.alive === false ? "Выбыл" : "🟢"}</span>
              </div>
            ))}

            {room.status === "waiting" && (
              <>
                {isHost ? (
                  <button
                    className="start"
                    onClick={startGame}
                    disabled={loading || players.length < 4}
                  >
                    {loading
                      ? "ЗАПУСК..."
                      : players.length < 4
                      ? `НУЖНО ЕЩЁ ${4 - players.length} ИГРОКА`
                      : "НАЧАТЬ ИГРУ"}
                  </button>
                ) : (
                  <p className="hint">Ждём, пока создатель начнёт игру...</p>
                )}
              </>
            )}

            {room.status === "playing" && (
              <div className="role">
                <h2>🎭 ИГРА НАЧАЛАСЬ</h2>

                {!showRole ? (
                  <>
                    <p>Нажми, чтобы узнать свою роль. Не показывай экран другим.</p>
                    <button
                      className="start"
                      onClick={() => setShowRole(true)}
                    >
                      ПОКАЗАТЬ МОЮ РОЛЬ
                    </button>
                  </>
                ) : (
                  <>
                    <h2>
                      {myPlayer?.role || "Роль не найдена"}
                    </h2>
                    <button
                      className="start"
                      onClick={() => setShowRole(false)}
                    >
                      СКРЫТЬ РОЛЬ
                    </button>
                  </>
                )}
              </div>
            )}

            <button className="start" onClick={refreshRoom}>
              ОБНОВИТЬ КОМНАТУ
            </button>
          </>
        )}

        <p className="hint">{message}</p>
      </div>
    </main>
  );
}
