using CatchTheSquare.Models;
using System.Text.Json;

namespace CatchTheSquare
{
    public static class RequestHandlers
    {
        private const string UsersFileName = "users.json";
        private static readonly SemaphoreSlim UsersLock = new(1, 1);

        public static async Task<IResult> GetUserAsync(long id)
        {
            await UsersLock.WaitAsync();
            try
            {
                var users = await ReadUsersAsync();
                var user = users.FirstOrDefault(x => x.Id == id);
                if (user == null)
                {
                    return Results.NotFound();
                }
                return Results.Ok(user);
            }
            finally
            {
                UsersLock.Release();
            }
        }

        public static async Task<IResult> SaveUserAsync(UserModel user)
        {
            await UsersLock.WaitAsync();
            try
            {
                var users = await ReadUsersAsync();
                var existingUser = users.FirstOrDefault(x => x.Id == user.Id);
                if (existingUser == null)
                {
                    users.Add(user);
                }
                else
                {
                    existingUser.Username = user.Username;
                }
    
                var options = new JsonSerializerOptions
                {
                    WriteIndented = true
                };
                var result = JsonSerializer.Serialize(users, options);
                await File.WriteAllTextAsync(UsersFileName, result);
                return Results.Ok();
            }
            finally
            {
                UsersLock.Release();
            }
        }

        public static async Task<IResult> SaveScoreAsync(UserModel model)
        {
            await UsersLock.WaitAsync();
            try
            {
                var users = await ReadUsersAsync();
                var user = users.FirstOrDefault(x => x.Id == model.Id);
                if (user == null)
                {
                    return Results.NotFound();
                }
    
                if (model.BestScore > user.BestScore)
                {
                    user.BestScore = model.BestScore;
    
                    var options = new JsonSerializerOptions
                    {
                        WriteIndented = true
                    };
                    var result = JsonSerializer.Serialize(users, options);
                    await File.WriteAllTextAsync(UsersFileName, result);
                }
    
                return Results.Ok(user.BestScore);
            }
            finally
            {
                UsersLock.Release();
            }
        }

        public static async Task<IResult> SaveThemeAsync(UserModel model)
        {
            await UsersLock.WaitAsync();
            try
            {
                if (model.Theme != "dark" && model.Theme != "light")
                {
                    return Results.BadRequest("Theme must be dark or light.");
                }
                var users = await ReadUsersAsync();
                var user = users.FirstOrDefault(x => x.Id == model.Id);
                if (user == null)
                {
                    return Results.NotFound();
                }
                user.Theme = model.Theme;
                var options = new JsonSerializerOptions { WriteIndented = true };
                var result = JsonSerializer.Serialize(users, options);
                await File.WriteAllTextAsync(UsersFileName, result);
                return Results.Ok(user.Theme);
            }
            finally
            {
                UsersLock.Release();
            }
        }
        private static async Task<List<UserModel>> ReadUsersAsync()
        {
            if (!File.Exists(UsersFileName))
            {
                return new List<UserModel>();
            }

            var json = await File.ReadAllTextAsync(UsersFileName);
            return string.IsNullOrWhiteSpace(json)
                ? new List<UserModel>()
                : JsonSerializer.Deserialize<List<UserModel>>(json)
                  ?? new List<UserModel>();
        }
    }
}
