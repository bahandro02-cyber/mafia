
import React, { useEffect, useState } from "react";
import { supabase } from "./supabase";
import "./App.css";

export default function OnlineLobby() {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [activeCode, setActiveCode] = useState("");
  const [players, setPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // Получаем пользователя или создаём анонимную сессию
  const getUser = async () => {
    const { data, error } = await supabase.auth.getSession();

    if (error) throw error;

    if (data.session?.user) {
      return data.session.user;
    }

    const result = await supabase.auth.signInAnonymously();

    if (result.error) throw result.error;

    return result.data.user;
  };

  // Создание комнаты
  const createRoom = async () => {
    if (!name.trim()) {
      setMessage("Введи своё имя!");
      return;
    }

    setLoading(true);

    try {
      const user = await getUser();

      const roomCode = Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();

      const { error: roomError } = await supabase
        .from("rooms")
        .insert({
          code: roomCode,
          host_name: name.trim(),
          host_id: user.id,
          players: [],
          game_state: { phase: "waiting" },
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

      setActiveCode(roomCode);
      setCode(roomCode);
      setIsHost(true);
      setMessage("Комната создана!");
    } catch (error) {
      setMessage("Ошибка: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Вход в комнату
  const joinRoom = async () => {
    if (!name.trim() || !code.trim()) {
      setMessage("Введи имя и код комнаты!");
      return;
    }

    setLoading(true);

    try {
      const user = await getUser();
      const roomCode = code.trim().toUpperCase();

      const { data: room, error } = await supabase
        .from("rooms")
        .select("code,status")
        .eq("code", roomCode)
        .maybeSingle();

      if (error) throw error;
      if (!room) throw new Error("Комната не найдена");

      if (room.status !== "waiting") {
        throw new Error("Игра уже началась");
      }

      const { error: memberError } = await supabase
        .from("room_members")
        .insert({
          room_code: roomCode,
          user_id: user.id,
          player_name: name.trim(),
          is_host: false,
        });

      if (memberError) throw memberError;

      setActiveCode(roomCode);
      setIsHost(false);
      setMessage("Ты подключился!");
    } catch (error) {
      setMessage("Ошибка: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Обновление списка игроков
  useEffect(() => {
    if (!activeCode) return;

    let alive = true;

    const loadPlayers = async () => {
      const { data, error } = await supabase
        .from("room_members")
        .select("id,player_name,is_host")
        .eq("room_code", activeCode)
        .order("joined_at");

      if (error) {
        if (alive) setMessage("Ошибка загрузки: " + error.message);
        return;
      }

      if (alive) {
        setPlayers(data || []);
      }
    };

    loadPlayers();

    const channel = supabase
      .channel("lobby-" + activeCode)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_members",
          filter: "room_code=eq." + activeCode,
        },
        loadPlayers
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [activeCode]);

  return (
    <div className="online-lobby">
      <h1>🔴 MAFIA NIGHT</h1>
      <p>ONLINE MULTIPLAYER</p>

      {!activeCode ? (
        <>
          <input
            placeholder="Твоё имя"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <button onClick={createRoom} disabled={loading}>
            {loading ? "ЗАГРУЗКА..." : "СОЗДАТЬ КОМНАТУ"}
          </button>

          <h3>ИЛИ ВОЙТИ В КОМНАТУ</h3>

          <input
            placeholder="Код комнаты"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />

          <button onClick={joinRoom} disabled={loading}>
            {loading ? "ЗАГРУЗКА..." : "ПРИСОЕДИНИТЬСЯ"}
          </button>
        </>
      ) : (
        <>
          <div className="room-code">
            <p>КОД КОМНАТЫ</p>
            <h1>{activeCode}</h1>
          </div>

          <h2>ИГРОКИ: {players.length}</h2>

          {players.map((player, index) => (
            <div className="online-player" key={player.id}>
              <span>{index + 1}. {player.player_name}</span>
              <span>{player.is_host ? "👑 ХОСТ" : "🟢 ИГРОК"}</span>
            </div>
          ))}

          {isHost && (
            <button
              onClick={() =>
                setMessage("Следующий этап — запуск онлайн-игры!")
              }
            >
              НАЧАТЬ ИГРУ
            </button>
          )}
        </>
      )}

      {message && <p className="online-message">{message}</p>}
    </div>
  );
}
