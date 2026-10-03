package com.example.eplakfixed

import okhttp3.OkHttpClient
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.POST

interface ApiService {
    @POST("customers")
    suspend fun saveCustomer(@Body request: CustomerRequest): Response<ResponseBody>

    companion object {
        private const val BASE_URL = "https://example.com/api/"

        fun create(): ApiService {
            val okHttpClient = OkHttpClient.Builder()
                .followRedirects(true)
                .followSslRedirects(true)
                .build()

            return Retrofit.Builder()
                .baseUrl(BASE_URL)
                .client(okHttpClient)
                .addConverterFactory(GsonConverterFactory.create())
                .build()
                .create(ApiService::class.java)
        }
    }
}