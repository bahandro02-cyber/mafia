
import { supabase, signInPlayer } from "./supabase";

// Получение игрового ID
export async function getPlayerId() {
  const user = await signInPlayer();
  return user.id;
}

// Создание комнаты
export async function createOnlineRoom(playerName) {
  const userId = await getPlayerId();

  const code = Math.random()
    .toString(36)
    .substring(2, 8)
    .toUpperCase();

  const { error: roomError } = await supabase
    .from("rooms")
    .insert({
      code,
      host_name: playerName,
      host_id: userId,
      players: [],
      game_state: {
        phase: "waiting",
        started: false,
      },
      status: "waiting",
    });

  if (roomError) throw roomError;

  const { error: memberError } = await supabase
    .from("room_members")
    .insert({
      room_code: code,
      user_id: userId,
      player_name: playerName,
      is_host: true,
    });

  if (memberError) throw memberError;

  return code;
}

// Подключение к комнате
export async function joinOnlineRoom(playerName, roomCode) {
  const userId = await getPlayerId();
  const code = roomCode.trim().toUpperCase();

  const { data: room, error } = await supabase
    .from("rooms")
    .select("code,status")
    .eq("code", code)
    .maybeSingle();

  if (error) throw error;
  if (!room) throw new Error("Комната не найдена");
  if (room.status !== "waiting") {
    throw new Error("Игра уже началась");
  }

  const { error: joinError } = await supabase
    .from("room_members")
    .insert({
      room_code: code,
      user_id: userId,
      player_name: playerName,
      is_host: false,
    });

  if (joinError) throw joinError;

  return code;
}

// Получение списка участников
export async function getRoomPlayers(code) {
  const { data, error } = await supabase
    .from("room_members")
    .select("id,user_id,player_name,is_host")
    .eq("room_code", code)
    .order("joined_at");

  if (error) throw error;

  return data || [];
}

// Подписка на изменения участников
export function subscribeRoom(code, callback) {
  return supabase
    .channel(`online-room-${code}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "room_members",
        filter: `room_code=eq.${code}`,
      },
      callback
    )
    .subscribe();
}
